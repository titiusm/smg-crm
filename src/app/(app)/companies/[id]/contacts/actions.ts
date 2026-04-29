"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/auth";
import { recordAudit } from "@/lib/audit";
import { isScopedToOwnCompanies } from "@/lib/rbac";
import { normalizePhone, safeTrim, isValidEmail } from "@/lib/utils";

const contactSchema = z.object({
  companyId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().optional().nullable(),
  roleTitle: z.string().optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  isPrimaryContact: z.coerce.boolean().optional(),
  doNotCall: z.coerce.boolean().optional(),
  doNotEmail: z.coerce.boolean().optional(),
  doNotText: z.coerce.boolean().optional(),
  notes: z.string().optional().nullable(),
});

async function enforceScope(userId: string, role: string, companyId: string) {
  const c = await prisma.company.findUnique({ where: { id: companyId } });
  if (!c || c.deletedAt) throw new Error("Not found");
  if (isScopedToOwnCompanies(role as "SALES_REP") && c.assignedRepId !== userId) {
    throw new Error("FORBIDDEN");
  }
  return c;
}

export async function createContact(formData: FormData) {
  const session = await requireSession();
  const parsed = contactSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  const data = parsed.data;
  await enforceScope(session.user.id, session.user.role, data.companyId);

  const email = safeTrim(data.email);
  if (email && !isValidEmail(email)) throw new Error("Invalid email");

  // If marking primary, clear other primaries for this company
  if (data.isPrimaryContact) {
    await prisma.contact.updateMany({
      where: { companyId: data.companyId, isPrimaryContact: true },
      data: { isPrimaryContact: false },
    });
  }

  await prisma.contact.create({
    data: {
      companyId: data.companyId,
      firstName: data.firstName.trim(),
      lastName: safeTrim(data.lastName),
      roleTitle: safeTrim(data.roleTitle),
      phoneNumber: normalizePhone(data.phoneNumber ?? null),
      email: email?.toLowerCase() ?? null,
      isPrimaryContact: Boolean(data.isPrimaryContact),
      doNotCall: Boolean(data.doNotCall),
      doNotEmail: Boolean(data.doNotEmail),
      doNotText: Boolean(data.doNotText),
      notes: safeTrim(data.notes),
    },
  });

  revalidatePath(`/companies/${data.companyId}`);
  redirect(`/companies/${data.companyId}`);
}

export async function updateContactDnc(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.contact.findUnique({ where: { id }, include: { company: true } });
  if (!existing) throw new Error("Not found");
  if (isScopedToOwnCompanies(session.user.role) && existing.company.assignedRepId !== session.user.id) {
    throw new Error("FORBIDDEN");
  }
  const doNotCall = formData.get("doNotCall") === "on" || formData.get("doNotCall") === "true";
  const doNotEmail = formData.get("doNotEmail") === "on" || formData.get("doNotEmail") === "true";
  const doNotText = formData.get("doNotText") === "on" || formData.get("doNotText") === "true";

  const updated = await prisma.contact.update({
    where: { id },
    data: {
      doNotCall,
      doNotEmail,
      doNotText,
      unsubscribedAt:
        doNotEmail && !existing.unsubscribedAt ? new Date() : existing.unsubscribedAt,
    },
  });

  await recordAudit({
    userId: session.user.id,
    actionType: "DNC_FLAG_CHANGED",
    entityType: "CONTACT",
    entityId: id,
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

  revalidatePath(`/companies/${existing.companyId}`);
}
