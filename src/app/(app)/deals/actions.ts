"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/auth";
import { recordAudit } from "@/lib/audit";
import type { DealStatus, DealType, Prisma } from "@prisma/client";

const dealSchema = z.object({
  companyId: z.string().min(1),
  dealType: z.enum(["FLAT_RATE_PER_PANEL", "PERCENTAGE_OF_INSURANCE_PAYOUT", "CUSTOM"]),
  pricePerPanel: z.string().optional().nullable(),
  percentage: z.string().optional().nullable(),
  customDescription: z.string().optional().nullable(),
  customTerms: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED", "PENDING_APPROVAL"]).optional(),
  effectiveDate: z.string().min(1),
  expirationDate: z.string().optional().nullable(),
  termsNotes: z.string().optional().nullable(),
});

function buildPricingDetails(input: z.infer<typeof dealSchema>) {
  if (input.dealType === "FLAT_RATE_PER_PANEL") {
    const v = parseFloat(input.pricePerPanel ?? "");
    return { type: "flat_rate", price_per_panel: isNaN(v) ? null : v };
  }
  if (input.dealType === "PERCENTAGE_OF_INSURANCE_PAYOUT") {
    const v = parseFloat(input.percentage ?? "");
    return { type: "percentage_of_payout", rate: isNaN(v) ? null : v / 100 };
  }
  return {
    type: "custom",
    description: input.customDescription ?? "",
    terms: input.customTerms ?? "",
  };
}

export async function createDeal(formData: FormData) {
  const session = await requireSession();
  const parsed = dealSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  const data = parsed.data;

  // Flag for approval if flat rate < $150
  let status: DealStatus = data.status ?? "ACTIVE";
  const pricing = buildPricingDetails(data);
  if (pricing.type === "flat_rate" && typeof pricing.price_per_panel === "number" && pricing.price_per_panel < 150) {
    status = "PENDING_APPROVAL";
  }

  const deal = await prisma.deal.create({
    data: {
      companyId: data.companyId,
      negotiatedByRepId: session.user.id,
      dealType: data.dealType as DealType,
      pricingDetails: pricing as unknown as Prisma.InputJsonValue,
      status,
      effectiveDate: new Date(data.effectiveDate),
      expirationDate: data.expirationDate ? new Date(data.expirationDate) : null,
      termsNotes: data.termsNotes ?? null,
    },
  });

  await recordAudit({
    userId: session.user.id,
    actionType: "DEAL_CREATED",
    entityType: "DEAL",
    entityId: deal.id,
    newValue: {
      companyId: deal.companyId,
      dealType: deal.dealType,
      pricingDetails: pricing,
      status: deal.status,
    },
  });

  revalidatePath(`/companies/${data.companyId}`);
  revalidatePath("/deals");
  redirect(`/companies/${data.companyId}`);
}

export async function updateDealStatus(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as DealStatus;
  if (!id || !status) throw new Error("Missing fields");

  const existing = await prisma.deal.findUnique({ where: { id } });
  if (!existing) throw new Error("Not found");

  const updated = await prisma.deal.update({
    where: { id },
    data: {
      status,
      approvedByUserId: status === "ACTIVE" && existing.status === "PENDING_APPROVAL" ? session.user.id : existing.approvedByUserId,
    },
  });

  await recordAudit({
    userId: session.user.id,
    actionType: "DEAL_MODIFIED",
    entityType: "DEAL",
    entityId: id,
    oldValue: { status: existing.status },
    newValue: { status: updated.status },
  });

  revalidatePath(`/companies/${existing.companyId}`);
  revalidatePath("/deals");
  revalidatePath(`/deals/${id}`);
}
