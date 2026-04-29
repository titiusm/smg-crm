"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/auth";
import { recordAudit } from "@/lib/audit";
import { isScopedToOwnCompanies } from "@/lib/rbac";
import { recalcEstimateTotal, syncJobTotals } from "@/lib/estimates";
import { recomputeJobCommission } from "@/app/(app)/jobs/actions";
import type { EstimateSentTo, EstimateType } from "@prisma/client";

async function guardJob(userId: string, role: string, jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { company: true } });
  if (!job || job.deletedAt) throw new Error("Not found");
  if (isScopedToOwnCompanies(role as "SALES_REP") && job.company.assignedRepId !== userId) {
    throw new Error("FORBIDDEN");
  }
  return job;
}

export async function createEstimate(formData: FormData) {
  const session = await requireSession();
  const jobId = String(formData.get("jobId") ?? "");
  const type = String(formData.get("estimateType") ?? "") as EstimateType;
  if (!jobId || !["INSURANCE_RETAIL", "SUBCONTRACTOR"].includes(type)) throw new Error("Invalid input");

  const job = await guardJob(session.user.id, session.user.role, jobId);

  // If an estimate of this type already exists, redirect to it (new versions are created explicitly)
  const existing = await prisma.estimate.findFirst({
    where: { jobId, estimateType: type, isCurrentVersion: true },
  });
  if (existing) {
    redirect(`/jobs/${jobId}/estimates/${existing.id}`);
  }

  const estimate = await prisma.estimate.create({
    data: {
      jobId,
      estimateType: type,
      versionNumber: 1,
      isCurrentVersion: true,
      totalAmount: 0,
    },
  });

  await recordAudit({
    userId: session.user.id,
    actionType: "ESTIMATE_CREATED",
    entityType: "ESTIMATE",
    entityId: estimate.id,
    newValue: { jobId, estimateType: type, versionNumber: 1 },
  });

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}/estimates/${estimate.id}`);
  // keep reference so this import isn't unused in some build modes
  void job;
}

/** Create a new version by copying the current version's line items (spec §9.5). */
export async function versionUp(formData: FormData) {
  const session = await requireSession();
  const estimateId = String(formData.get("estimateId") ?? "");
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: { lineItems: true, job: { include: { company: true } } },
  });
  if (!estimate) throw new Error("Not found");
  if (isScopedToOwnCompanies(session.user.role) && estimate.job.company.assignedRepId !== session.user.id) {
    throw new Error("FORBIDDEN");
  }

  // Flip the current flag off on all existing versions of this type
  await prisma.estimate.updateMany({
    where: { jobId: estimate.jobId, estimateType: estimate.estimateType },
    data: { isCurrentVersion: false },
  });

  const nextVersion = await prisma.estimate.create({
    data: {
      jobId: estimate.jobId,
      estimateType: estimate.estimateType,
      versionNumber: estimate.versionNumber + 1,
      isCurrentVersion: true,
      totalAmount: estimate.totalAmount,
    },
  });

  // Copy line items
  if (estimate.lineItems.length > 0) {
    await prisma.estimateLineItem.createMany({
      data: estimate.lineItems.map((li) => ({
        estimateId: nextVersion.id,
        itemName: li.itemName,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        total: li.total,
        isCustom: li.isCustom,
        sortOrder: li.sortOrder,
      })),
    });
  }

  await recalcEstimateTotal(nextVersion.id);
  await syncJobTotals(estimate.jobId);
  await recomputeJobCommission(estimate.jobId);

  await recordAudit({
    userId: session.user.id,
    actionType: "ESTIMATE_VERSIONED",
    entityType: "ESTIMATE",
    entityId: nextVersion.id,
    oldValue: { versionNumber: estimate.versionNumber },
    newValue: { versionNumber: nextVersion.versionNumber },
  });

  revalidatePath(`/jobs/${estimate.jobId}`);
  redirect(`/jobs/${estimate.jobId}/estimates/${nextVersion.id}`);
}

const lineItemSchema = z.object({
  estimateId: z.string().min(1),
  itemName: z.string().min(1),
  description: z.string().optional().nullable(),
  quantity: z.coerce.number().min(0),
  unitPrice: z.coerce.number().min(0),
  isCustom: z.coerce.boolean().optional(),
});

export async function addLineItem(formData: FormData) {
  const session = await requireSession();
  const parsed = lineItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  const d = parsed.data;

  const estimate = await prisma.estimate.findUnique({
    where: { id: d.estimateId },
    include: { job: { include: { company: true } } },
  });
  if (!estimate) throw new Error("Not found");
  if (isScopedToOwnCompanies(session.user.role) && estimate.job.company.assignedRepId !== session.user.id) {
    throw new Error("FORBIDDEN");
  }

  const total = d.quantity * d.unitPrice;
  const lastSort = await prisma.estimateLineItem.findFirst({
    where: { estimateId: d.estimateId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.estimateLineItem.create({
    data: {
      estimateId: d.estimateId,
      itemName: d.itemName,
      description: d.description ?? null,
      quantity: d.quantity,
      unitPrice: d.unitPrice,
      total,
      isCustom: !!d.isCustom,
      sortOrder: (lastSort?.sortOrder ?? 0) + 10,
    },
  });

  await recalcEstimateTotal(d.estimateId);
  await syncJobTotals(estimate.jobId);
  await recomputeJobCommission(estimate.jobId);

  revalidatePath(`/jobs/${estimate.jobId}/estimates/${d.estimateId}`);
  revalidatePath(`/jobs/${estimate.jobId}`);
}

export async function updateLineItem(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const unitPrice = Number(formData.get("unitPrice") ?? 0);
  const itemName = String(formData.get("itemName") ?? "").trim();
  if (!id || !itemName) throw new Error("Missing fields");

  const li = await prisma.estimateLineItem.findUnique({
    where: { id },
    include: { estimate: { include: { job: { include: { company: true } } } } },
  });
  if (!li) throw new Error("Not found");
  if (isScopedToOwnCompanies(session.user.role) && li.estimate.job.company.assignedRepId !== session.user.id) {
    throw new Error("FORBIDDEN");
  }

  await prisma.estimateLineItem.update({
    where: { id },
    data: {
      itemName,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
    },
  });

  await recalcEstimateTotal(li.estimateId);
  await syncJobTotals(li.estimate.jobId);
  await recomputeJobCommission(li.estimate.jobId);

  revalidatePath(`/jobs/${li.estimate.jobId}/estimates/${li.estimateId}`);
}

export async function deleteLineItem(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const li = await prisma.estimateLineItem.findUnique({
    where: { id },
    include: { estimate: { include: { job: { include: { company: true } } } } },
  });
  if (!li) throw new Error("Not found");
  if (isScopedToOwnCompanies(session.user.role) && li.estimate.job.company.assignedRepId !== session.user.id) {
    throw new Error("FORBIDDEN");
  }

  await prisma.estimateLineItem.delete({ where: { id } });
  await recalcEstimateTotal(li.estimateId);
  await syncJobTotals(li.estimate.jobId);
  await recomputeJobCommission(li.estimate.jobId);

  revalidatePath(`/jobs/${li.estimate.jobId}/estimates/${li.estimateId}`);
}

export async function applyMaximize(formData: FormData) {
  const session = await requireSession();
  const estimateId = String(formData.get("estimateId") ?? "");
  // menuItemIds is a comma-separated list of accepted suggestions
  const accepted = String(formData.get("accepted") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!estimateId || accepted.length === 0) return;

  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: { job: { include: { company: true } } },
  });
  if (!estimate) throw new Error("Not found");
  if (isScopedToOwnCompanies(session.user.role) && estimate.job.company.assignedRepId !== session.user.id) {
    throw new Error("FORBIDDEN");
  }

  const items = await prisma.lineItemMenu.findMany({ where: { id: { in: accepted } } });
  const lastSort = await prisma.estimateLineItem.findFirst({
    where: { estimateId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  let sort = (lastSort?.sortOrder ?? 0) + 10;
  // Default qty = 1 (user can change per line)
  const panels = Number(estimate.job.panelCount ?? 0);
  for (const m of items) {
    const qty = m.unitType === "per panel" && panels > 0 ? panels : 1;
    const unit = Number(m.defaultUnitPrice);
    await prisma.estimateLineItem.create({
      data: {
        estimateId,
        itemName: m.itemName,
        description: m.description,
        quantity: qty,
        unitPrice: unit,
        total: qty * unit,
        isCustom: false,
        sortOrder: sort,
      },
    });
    sort += 10;
  }

  await recalcEstimateTotal(estimateId);
  await syncJobTotals(estimate.jobId);
  await recomputeJobCommission(estimate.jobId);

  revalidatePath(`/jobs/${estimate.jobId}/estimates/${estimateId}`);
  revalidatePath(`/jobs/${estimate.jobId}`);
}

export async function markEstimateSent(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const sentTo = String(formData.get("sentTo") ?? "") as EstimateSentTo;
  if (!id) throw new Error("Missing id");

  const estimate = await prisma.estimate.findUnique({
    where: { id },
    include: { job: { include: { company: true } } },
  });
  if (!estimate) throw new Error("Not found");
  if (isScopedToOwnCompanies(session.user.role) && estimate.job.company.assignedRepId !== session.user.id) {
    throw new Error("FORBIDDEN");
  }

  await prisma.estimate.update({
    where: { id },
    data: { sentTo, dateSent: new Date() },
  });
  await recordAudit({
    userId: session.user.id,
    actionType: "ESTIMATE_SENT",
    entityType: "ESTIMATE",
    entityId: id,
    newValue: { sentTo },
  });

  revalidatePath(`/jobs/${estimate.jobId}/estimates/${id}`);
}

