"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/auth";
import { recordAudit } from "@/lib/audit";
import { canDeleteCompany, isScopedToOwnCompanies } from "@/lib/rbac";
import { normalizePhone, safeTrim, isValidEmail } from "@/lib/utils";
import type { CompanySource, CompanyStatus, DealFlowTier } from "@prisma/client";

const CompanyStatusEnum = z.enum([
  "COLD",
  "CONTACTED",
  "INTERESTED",
  "AGREED_TO_USE_US",
  "FIRST_JOB_SENT",
  "REPEAT_CUSTOMER",
  "CLOSED_INACTIVE",
]);
const DealFlowTierEnum = z.enum(["HIGH_VOLUME", "MEDIUM_VOLUME", "LOW_VOLUME", "NEW_UNKNOWN"]);

const createSchema = z.object({
  companyName: z.string().min(1, "Name required"),
  phoneNumber: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  addressStreet: z.string().optional().nullable(),
  addressCity: z.string().optional().nullable(),
  addressState: z.string().optional().nullable(),
  addressZip: z.string().optional().nullable(),
  status: CompanyStatusEnum.optional(),
  dealFlowTier: DealFlowTierEnum.optional(),
  googleReviewCount: z.coerce.number().int().nonnegative().optional().nullable(),
  googleRating: z.coerce.number().min(0).max(5).optional().nullable(),
  assignedRepId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function createCompany(formData: FormData) {
  const session = await requireSession();
  const raw = Object.fromEntries(formData.entries());
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const email = safeTrim(parsed.data.email);
  if (email && !isValidEmail(email)) throw new Error("Invalid email");

  // Reps can create companies; they're auto-assigned to themselves.
  const assignedRepId =
    isScopedToOwnCompanies(session.user.role)
      ? session.user.id
      : safeTrim(parsed.data.assignedRepId) ?? null;

  const company = await prisma.company.create({
    data: {
      companyName: parsed.data.companyName.trim(),
      phoneNumber: normalizePhone(parsed.data.phoneNumber ?? null),
      email: email?.toLowerCase() ?? null,
      website: safeTrim(parsed.data.website),
      addressStreet: safeTrim(parsed.data.addressStreet),
      addressCity: safeTrim(parsed.data.addressCity),
      addressState: safeTrim(parsed.data.addressState),
      addressZip: safeTrim(parsed.data.addressZip),
      status: (parsed.data.status ?? "COLD") as CompanyStatus,
      dealFlowTier: (parsed.data.dealFlowTier ?? "NEW_UNKNOWN") as DealFlowTier,
      googleReviewCount: parsed.data.googleReviewCount ?? null,
      googleRating: parsed.data.googleRating ?? null,
      assignedRepId,
      createdByUserId: session.user.id,
      notes: safeTrim(parsed.data.notes),
      source: "MANUAL_ENTRY" as CompanySource,
    },
  });

  revalidatePath("/companies");
  redirect(`/companies/${company.id}`);
}

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1),
  nextActionType: z.string().optional().nullable(),
  nextActionDate: z.string().optional().nullable(),
  doNotCall: z.coerce.boolean().optional(),
  doNotEmail: z.coerce.boolean().optional(),
  doNotText: z.coerce.boolean().optional(),
});

export async function updateCompany(formData: FormData) {
  const session = await requireSession();
  const raw = Object.fromEntries(formData.entries());
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  const id = parsed.data.id;

  const existing = await prisma.company.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new Error("Not found");

  // Rep can only edit assigned
  if (isScopedToOwnCompanies(session.user.role) && existing.assignedRepId !== session.user.id) {
    throw new Error("FORBIDDEN");
  }

  const dncChanged =
    (parsed.data.doNotCall !== undefined && parsed.data.doNotCall !== existing.doNotCall) ||
    (parsed.data.doNotEmail !== undefined && parsed.data.doNotEmail !== existing.doNotEmail) ||
    (parsed.data.doNotText !== undefined && parsed.data.doNotText !== existing.doNotText);

  const assignedRepChanged =
    parsed.data.assignedRepId !== undefined &&
    parsed.data.assignedRepId !== existing.assignedRepId &&
    !isScopedToOwnCompanies(session.user.role);

  const nextActionDate = safeTrim(parsed.data.nextActionDate ?? null);

  const updated = await prisma.company.update({
    where: { id },
    data: {
      companyName: parsed.data.companyName?.trim() ?? existing.companyName,
      phoneNumber:
        parsed.data.phoneNumber !== undefined
          ? normalizePhone(parsed.data.phoneNumber)
          : existing.phoneNumber,
      email:
        parsed.data.email !== undefined
          ? safeTrim(parsed.data.email)?.toLowerCase() ?? null
          : existing.email,
      website:
        parsed.data.website !== undefined ? safeTrim(parsed.data.website) : existing.website,
      addressStreet:
        parsed.data.addressStreet !== undefined ? safeTrim(parsed.data.addressStreet) : existing.addressStreet,
      addressCity:
        parsed.data.addressCity !== undefined ? safeTrim(parsed.data.addressCity) : existing.addressCity,
      addressState:
        parsed.data.addressState !== undefined ? safeTrim(parsed.data.addressState) : existing.addressState,
      addressZip:
        parsed.data.addressZip !== undefined ? safeTrim(parsed.data.addressZip) : existing.addressZip,
      status: parsed.data.status ?? existing.status,
      dealFlowTier: parsed.data.dealFlowTier ?? existing.dealFlowTier,
      googleReviewCount:
        parsed.data.googleReviewCount !== undefined
          ? parsed.data.googleReviewCount
          : existing.googleReviewCount,
      googleRating:
        parsed.data.googleRating !== undefined ? parsed.data.googleRating : existing.googleRating,
      assignedRepId:
        parsed.data.assignedRepId !== undefined &&
        !isScopedToOwnCompanies(session.user.role)
          ? safeTrim(parsed.data.assignedRepId) ?? null
          : existing.assignedRepId,
      notes: parsed.data.notes !== undefined ? safeTrim(parsed.data.notes) : existing.notes,
      nextActionType:
        parsed.data.nextActionType !== undefined
          ? safeTrim(parsed.data.nextActionType)
          : existing.nextActionType,
      nextActionDate: nextActionDate ? new Date(nextActionDate) : parsed.data.nextActionDate === "" ? null : existing.nextActionDate,
      doNotCall: parsed.data.doNotCall ?? existing.doNotCall,
      doNotEmail: parsed.data.doNotEmail ?? existing.doNotEmail,
      doNotText: parsed.data.doNotText ?? existing.doNotText,
    },
  });

  // Log relationship-relevant changes
  if (assignedRepChanged) {
    await recordAudit({
      userId: session.user.id,
      actionType: "COMPANY_REASSIGNED",
      entityType: "COMPANY",
      entityId: updated.id,
      oldValue: { assignedRepId: existing.assignedRepId },
      newValue: { assignedRepId: updated.assignedRepId },
    });
    // Phase 1D notifications will add in-app notification to both reps here.
  }
  if (dncChanged) {
    await recordAudit({
      userId: session.user.id,
      actionType: "DNC_FLAG_CHANGED",
      entityType: "COMPANY",
      entityId: updated.id,
      oldValue: {
        doNotCall: existing.doNotCall,
        doNotEmail: existing.doNotEmail,
        doNotText: existing.doNotText,
      },
      newValue: {
        doNotCall: updated.doNotCall,
        doNotEmail: updated.doNotEmail,
        doNotText: updated.doNotText,
      },
    });
  }

  // Log any edits to core info as activity timeline entries (spec §9.1)
  const infoChanged =
    parsed.data.companyName && parsed.data.companyName !== existing.companyName
      || (parsed.data.phoneNumber !== undefined && normalizePhone(parsed.data.phoneNumber) !== existing.phoneNumber)
      || (parsed.data.email !== undefined && (safeTrim(parsed.data.email)?.toLowerCase() ?? null) !== existing.email)
      || (parsed.data.status !== undefined && parsed.data.status !== existing.status);
  if (infoChanged) {
    await prisma.activity.create({
      data: {
        companyId: updated.id,
        repId: session.user.id,
        activityType:
          parsed.data.status && parsed.data.status !== existing.status
            ? "STATUS_CHANGE"
            : "COMPANY_INFO_UPDATE",
        subject:
          parsed.data.status && parsed.data.status !== existing.status
            ? `Status: ${existing.status} → ${parsed.data.status}`
            : "Company info updated",
      },
    });
  }

  revalidatePath(`/companies/${updated.id}`);
  revalidatePath("/companies");
}

export async function softDeleteCompany(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing id");

  const existing = await prisma.company.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new Error("Not found");

  if (!canDeleteCompany(session.user.role, session.user.permissions)) {
    // Reps can only close/inactive; per spec.
    await prisma.company.update({
      where: { id },
      data: { status: "CLOSED_INACTIVE" },
    });
    revalidatePath(`/companies/${id}`);
    revalidatePath("/companies");
    return;
  }

  await prisma.company.update({
    where: { id },
    data: { deletedAt: new Date(), status: "CLOSED_INACTIVE" },
  });
  await recordAudit({
    userId: session.user.id,
    actionType: "COMPANY_DELETED",
    entityType: "COMPANY",
    entityId: id,
    oldValue: { status: existing.status, deletedAt: null },
    newValue: { status: "CLOSED_INACTIVE", deletedAt: new Date().toISOString() },
  });
  revalidatePath("/companies");
  redirect("/companies");
}

export async function addActivityNote(formData: FormData) {
  const session = await requireSession();
  const companyId = String(formData.get("companyId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!companyId || !notes) throw new Error("Missing fields");

  // Enforce scope
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company || company.deletedAt) throw new Error("Not found");
  if (isScopedToOwnCompanies(session.user.role) && company.assignedRepId !== session.user.id) {
    throw new Error("FORBIDDEN");
  }

  await prisma.activity.create({
    data: {
      companyId,
      repId: session.user.id,
      activityType: "NOTE",
      detailedNotes: notes,
    },
  });

  await prisma.company.update({
    where: { id: companyId },
    data: { dateLastContacted: new Date() },
  });

  revalidatePath(`/companies/${companyId}`);
}

export async function logMeeting(formData: FormData) {
  const session = await requireSession();
  const companyId = String(formData.get("companyId") ?? "");
  const meetingType = String(formData.get("meetingType") ?? "IN_PERSON");
  const meetingOutcome = String(formData.get("meetingOutcome") ?? "").trim();
  const meetingDate = String(formData.get("meetingDate") ?? "");
  if (!companyId || !meetingOutcome) throw new Error("Missing fields");
  const meetingDateObj = meetingDate ? new Date(meetingDate) : new Date();

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company || company.deletedAt) throw new Error("Not found");
  if (isScopedToOwnCompanies(session.user.role) && company.assignedRepId !== session.user.id) {
    throw new Error("FORBIDDEN");
  }

  await prisma.activity.create({
    data: {
      companyId,
      repId: session.user.id,
      activityType: "MEETING",
      meetingType: meetingType as "IN_PERSON" | "PHONE" | "VIDEO",
      meetingOutcome,
      meetingDate: meetingDateObj,
      subject: `Meeting — ${meetingType.toLowerCase()}`,
    },
  });
  await prisma.company.update({
    where: { id: companyId },
    data: { dateLastContacted: new Date() },
  });

  revalidatePath(`/companies/${companyId}`);
}

// ----------------------------------------------------------------------------
// Bulk actions (Phase 1E §9.14)
// ----------------------------------------------------------------------------

const bulkIdsSchema = z.object({
  ids: z.string().min(1), // comma-separated cuids
});

/** Bulk reassign. Owner/Admin only — reps are scoped and cannot bulk-assign. */
export async function bulkAssignRep(formData: FormData) {
  const session = await requireSession();
  if (isScopedToOwnCompanies(session.user.role)) throw new Error("FORBIDDEN");

  const parsed = bulkIdsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error("Invalid selection");
  const assignedRepId = safeTrim(String(formData.get("assignedRepId") ?? "")) ?? null;

  const ids = parsed.data.ids.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return;

  const before = await prisma.company.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, assignedRepId: true },
  });
  await prisma.company.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: { assignedRepId },
  });

  const changed = before.filter((c) => c.assignedRepId !== assignedRepId);
  await Promise.all(
    changed.map((c) =>
      recordAudit({
        userId: session.user.id,
        actionType: "COMPANY_REASSIGNED",
        entityType: "COMPANY",
        entityId: c.id,
        oldValue: { assignedRepId: c.assignedRepId },
        newValue: { assignedRepId },
        reason: `Bulk reassignment (${changed.length} companies)`,
      })
    )
  );

  revalidatePath("/companies");
}

export async function bulkChangeStatus(formData: FormData) {
  const session = await requireSession();
  if (isScopedToOwnCompanies(session.user.role)) throw new Error("FORBIDDEN");
  const parsed = bulkIdsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error("Invalid selection");
  const status = CompanyStatusEnum.parse(String(formData.get("status") ?? ""));
  const ids = parsed.data.ids.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return;

  await prisma.company.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: { status: status as CompanyStatus },
  });

  await prisma.activity.createMany({
    data: ids.map((id) => ({
      companyId: id,
      repId: session.user.id,
      activityType: "STATUS_CHANGE" as const,
      subject: `Bulk status → ${status}`,
    })),
  });

  revalidatePath("/companies");
}
