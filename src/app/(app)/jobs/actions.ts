"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/auth";
import { recordAudit } from "@/lib/audit";
import { isBackwardMove, isUnusualBackwardMove, requiresApproval as needsApproval, JOB_STATUS_ORDER } from "@/lib/jobs";
import {
  currentQuarterString,
  parseStructure,
  tierRateFor,
} from "@/lib/commission";
import { isScopedToOwnCompanies, canSeeCosts } from "@/lib/rbac";
import type {
  ApprovalStatus,
  CommissionStatus,
  JobStatus,
  JobType,
  Prisma,
} from "@prisma/client";

const createSchema = z.object({
  companyId: z.string().min(1),
  contactId: z.string().optional().nullable(),
  jobType: z.enum(["DETACH_AND_REINSTALL", "DETACH_ONLY", "DIRECT_CUSTOMER"]).optional(),
  jobAddressStreet: z.string().optional().nullable(),
  jobAddressCity: z.string().optional().nullable(),
  jobAddressState: z.string().optional().nullable(),
  jobAddressZip: z.string().optional().nullable(),
  panelCount: z.coerce.number().int().nonnegative().optional().nullable(),
  pricePerPanel: z.coerce.number().nonnegative().optional().nullable(),
  insuranceEstimateTotal: z.coerce.number().nonnegative().optional().nullable(),
  subcontractorEstimateTotal: z.coerce.number().nonnegative().optional().nullable(),
  insuranceCompanyName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
});

export async function createJob(formData: FormData) {
  const session = await requireSession();
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  const d = parsed.data;

  const company = await prisma.company.findUnique({ where: { id: d.companyId } });
  if (!company || company.deletedAt) throw new Error("Company not found");
  if (isScopedToOwnCompanies(session.user.role) && company.assignedRepId !== session.user.id) {
    throw new Error("FORBIDDEN");
  }

  const pricePerPanel = d.pricePerPanel ?? null;
  const mustApprove = needsApproval(pricePerPanel);

  const job = await prisma.job.create({
    data: {
      companyId: d.companyId,
      contactId: d.contactId || null,
      assignedRepId: company.assignedRepId ?? session.user.id,
      dealId: d.dealId || null,
      jobType: (d.jobType ?? "DETACH_AND_REINSTALL") as JobType,
      jobAddressStreet: d.jobAddressStreet || null,
      jobAddressCity: d.jobAddressCity || null,
      jobAddressState: d.jobAddressState || null,
      jobAddressZip: d.jobAddressZip || null,
      panelCount: d.panelCount ?? null,
      pricePerPanel,
      insuranceEstimateTotal: d.insuranceEstimateTotal ?? null,
      subcontractorEstimateTotal: d.subcontractorEstimateTotal ?? null,
      insuranceCompanyName: d.insuranceCompanyName || null,
      notes: d.notes || null,
      status: "ESTIMATE_SENT",
      statusHistory: [
        { status: "ESTIMATE_SENT", changed_at: new Date().toISOString(), changed_by: session.user.id },
      ],
      dateEstimateSent: new Date(),
      requiresApproval: mustApprove,
      approvalStatus: (mustApprove ? "PENDING" : "NOT_REQUIRED") as ApprovalStatus,
    },
  });

  // Recompute per-job commission estimate at the base rate (10%).
  await recomputeJobCommission(job.id);

  // If the company was in a pre-customer stage, bump its status forward.
  if (["COLD", "CONTACTED", "INTERESTED", "AGREED_TO_USE_US"].includes(company.status)) {
    await prisma.company.update({
      where: { id: company.id },
      data: {
        status: "FIRST_JOB_SENT",
        dateLastProject: new Date(),
      },
    });
  } else {
    await prisma.company.update({
      where: { id: company.id },
      data: { dateLastProject: new Date() },
    });
  }

  await recordAudit({
    userId: session.user.id,
    actionType: "JOB_CREATED",
    entityType: "JOB",
    entityId: job.id,
    newValue: {
      companyId: d.companyId,
      panelCount: d.panelCount,
      pricePerPanel,
      requiresApproval: mustApprove,
    },
  });

  // Notify owner if approval is required
  if (mustApprove) {
    await notifyOwners(
      "APPROVAL_NEEDED",
      `Pricing approval needed: ${company.companyName}`,
      `Job priced at $${pricePerPanel?.toFixed(2)}/panel (below minimum $150).`,
      "JOB",
      job.id
    );
  }

  revalidatePath(`/companies/${d.companyId}`);
  revalidatePath("/jobs");
  redirect(`/jobs/${job.id}`);
}

export async function transitionJobStatus(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("status") ?? "") as JobStatus;
  if (!id || !JOB_STATUS_ORDER.includes(next as JobStatus) && next !== "CANCELLED") {
    throw new Error("Invalid status");
  }

  const job = await prisma.job.findUnique({ where: { id }, include: { company: true } });
  if (!job || job.deletedAt) throw new Error("Not found");
  if (isScopedToOwnCompanies(session.user.role) && job.company.assignedRepId !== session.user.id) {
    throw new Error("FORBIDDEN");
  }

  // Jobs under approval cannot proceed past ESTIMATE_SENT.
  if (job.approvalStatus === "PENDING" && next !== "ESTIMATE_SENT" && next !== "CANCELLED") {
    throw new Error("This job is pending pricing approval. Owner must approve before advancing.");
  }

  const backward = isBackwardMove(job.status, next);
  const unusual = isUnusualBackwardMove(job.status, next);

  const history = [
    ...(Array.isArray(job.statusHistory) ? (job.statusHistory as unknown[]) : []),
    { status: next, changed_at: new Date().toISOString(), changed_by: session.user.id, backward },
  ];

  const patch: Prisma.JobUpdateInput = {
    status: next,
    statusHistory: history as unknown as Prisma.InputJsonValue,
  };
  const now = new Date();
  if (next === "APPROVED") patch.dateApproved = now;
  if (next === "DETACH_COMPLETE") patch.dateDetachCompleted = now;
  if (next === "REINSTALL_COMPLETE") patch.dateReinstallCompleted = now;
  if (next === "INVOICED") patch.dateInvoiced = now;
  if (next === "PAID") {
    patch.datePaid = now;
    patch.commissionStatus = "ELIGIBLE";
    patch.commissionQuarter = currentQuarterString();
  }
  if (next === "CANCELLED") {
    patch.commissionStatus = "CANCELLED";
    patch.repCommission = 0;
  }

  await prisma.job.update({ where: { id }, data: patch });

  await recordAudit({
    userId: session.user.id,
    actionType: "JOB_STATUS_CHANGED",
    entityType: "JOB",
    entityId: id,
    oldValue: { status: job.status },
    newValue: { status: next, backward },
  });

  // Alert owner on unusual backward move from REINSTALL_COMPLETE.
  if (unusual) {
    await notifyOwners(
      "BACKWARD_STATUS_CHANGE",
      `Unusual backward status change`,
      `${job.company.companyName} — moved from Reinstall Complete back to ${next}.`,
      "JOB",
      id
    );
  }

  if (next === "PAID") await recomputeJobCommission(id);

  revalidatePath(`/jobs/${id}`);
  revalidatePath("/jobs");
  revalidatePath(`/companies/${job.companyId}`);
}

export async function cancelJob(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id || !reason) throw new Error("Cancellation reason is required");

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) throw new Error("Not found");

  await prisma.job.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancellationReason: reason,
      commissionStatus: "CANCELLED",
      repCommission: 0,
      statusHistory: [
        ...(Array.isArray(job.statusHistory) ? (job.statusHistory as unknown[]) : []),
        { status: "CANCELLED", changed_at: new Date().toISOString(), changed_by: session.user.id, reason },
      ] as unknown as Prisma.InputJsonValue,
    },
  });

  await recordAudit({
    userId: session.user.id,
    actionType: "JOB_CANCELLED",
    entityType: "JOB",
    entityId: id,
    oldValue: { status: job.status },
    newValue: { status: "CANCELLED", reason },
  });

  revalidatePath(`/jobs/${id}`);
  revalidatePath("/jobs");
}

export async function approvalDecision(formData: FormData) {
  const session = await requireRole(["OWNER"]);
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "") as "APPROVED" | "DENIED";
  if (!id || !["APPROVED", "DENIED"].includes(decision)) throw new Error("Invalid decision");

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) throw new Error("Not found");

  await prisma.job.update({
    where: { id },
    data: {
      approvalStatus: decision as ApprovalStatus,
      approvedByUserId: session.user.id,
      approvedAt: new Date(),
    },
  });

  await recordAudit({
    userId: session.user.id,
    actionType: "APPROVAL_DECISION",
    entityType: "JOB",
    entityId: id,
    oldValue: { approvalStatus: job.approvalStatus },
    newValue: { approvalStatus: decision },
  });

  revalidatePath(`/jobs/${id}`);
}

export async function enterCosts(formData: FormData) {
  const session = await requireSession();
  if (!canSeeCosts(session.user.role, session.user.permissions)) throw new Error("FORBIDDEN");
  const id = String(formData.get("id") ?? "");
  const actualCost = Number(formData.get("actualCost") ?? NaN);
  if (!id || isNaN(actualCost) || actualCost < 0) throw new Error("Invalid cost");

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) throw new Error("Not found");

  const subTotal = Number(job.subcontractorEstimateTotal ?? 0);
  const snapshot = subTotal - actualCost;

  // First-time cost entry freezes the snapshot.
  if (!job.profitSnapshotDate) {
    await prisma.job.update({
      where: { id },
      data: {
        actualCost,
        profitSnapshot: snapshot,
        profitSnapshotDate: new Date(),
      },
    });
    await recordAudit({
      userId: session.user.id,
      actionType: "COST_ENTRY",
      entityType: "JOB",
      entityId: id,
      newValue: { actualCost, profitSnapshot: snapshot },
    });
    await recordAudit({
      userId: session.user.id,
      actionType: "PROFIT_SNAPSHOT_LOCKED",
      entityType: "JOB",
      entityId: id,
      newValue: { actualCost, profitSnapshot: snapshot, lockedAt: new Date().toISOString() },
    });
  } else {
    // Subsequent edits go into revised_margin_note; original snapshot preserved.
    const note = String(formData.get("revisedMarginNote") ?? "").trim();
    if (!note) throw new Error("Snapshot is already frozen. A note explaining the revision is required.");
    await prisma.job.update({
      where: { id },
      data: {
        actualCost,
        revisedMarginNote: note,
      },
    });
    await recordAudit({
      userId: session.user.id,
      actionType: "COST_EDIT",
      entityType: "JOB",
      entityId: id,
      oldValue: { actualCost: job.actualCost, profitSnapshot: job.profitSnapshot },
      newValue: { actualCost, revisedMarginNote: note },
      reason: note,
    });
  }

  revalidatePath(`/jobs/${id}`);
}

export async function overrideCommissionQuarter(formData: FormData) {
  const session = await requireRole(["OWNER"]);
  const id = String(formData.get("id") ?? "");
  const quarter = String(formData.get("quarter") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id || !/^\d{4}-Q[1-4]$/.test(quarter)) throw new Error("Quarter must be like 2026-Q2");

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) throw new Error("Not found");

  await prisma.job.update({ where: { id }, data: { commissionQuarter: quarter } });
  await recordAudit({
    userId: session.user.id,
    actionType: "COMMISSION_QUARTER_OVERRIDE",
    entityType: "JOB",
    entityId: id,
    oldValue: { commissionQuarter: job.commissionQuarter },
    newValue: { commissionQuarter: quarter },
    reason: reason || null,
  });

  revalidatePath(`/jobs/${id}`);
}

export async function markCommissionPaid(formData: FormData) {
  const session = await requireRole(["OWNER"]);
  const id = String(formData.get("id") ?? "");
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) throw new Error("Not found");
  if (job.commissionStatus !== "ELIGIBLE") throw new Error("Job must be Eligible to mark Paid");

  await prisma.job.update({
    where: { id },
    data: { commissionStatus: "PAID" as CommissionStatus, commissionLocked: true },
  });
  await recordAudit({
    userId: session.user.id,
    actionType: "COMMISSION_EDIT",
    entityType: "JOB",
    entityId: id,
    oldValue: { commissionStatus: job.commissionStatus },
    newValue: { commissionStatus: "PAID", commissionLocked: true },
  });
  revalidatePath(`/jobs/${id}`);
}

// ----------------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------------

export async function recomputeJobCommission(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { assignedRep: true },
  });
  if (!job) return;
  if (job.commissionLocked || job.commissionStatus === "PAID" || job.commissionStatus === "CANCELLED") return;

  const subTotal = Number(job.subcontractorEstimateTotal ?? 0);
  const structure = parseStructure(job.assignedRep?.commissionStructure ?? null);
  const baseRate = structure.base_rate;
  const amount = subTotal * baseRate;

  await prisma.job.update({
    where: { id: jobId },
    data: { repCommission: amount },
  });
}

async function notifyOwners(
  type: "APPROVAL_NEEDED" | "BACKWARD_STATUS_CHANGE" | "COMMISSION_UPDATE",
  title: string,
  message: string,
  entityType: string,
  entityId: string
) {
  const owners = await prisma.user.findMany({
    where: { role: "OWNER", isActive: true },
    select: { id: true },
  });
  if (owners.length === 0) return;
  await prisma.notification.createMany({
    data: owners.map((o) => ({
      userId: o.id,
      notificationType: type,
      title,
      message,
      relatedEntityType: entityType,
      relatedEntityId: entityId,
    })),
  });
}
