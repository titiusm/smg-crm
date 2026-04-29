"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/auth";
import type { CampaignFollowUpCondition, CampaignType, Prisma } from "@prisma/client";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["COLD_OUTREACH", "DRIP", "ONBOARDING", "RE_ENGAGEMENT", "CUSTOM"]),
});

export async function createCampaign(formData: FormData) {
  const session = await requireRole(["OWNER", "LIMITED_ADMIN"]);
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  const c = await prisma.emailCampaign.create({
    data: {
      name: parsed.data.name.trim(),
      type: parsed.data.type as CampaignType,
      createdByUserId: session.user.id,
    },
  });
  revalidatePath("/campaigns");
  redirect(`/campaigns/${c.id}`);
}

export async function addCampaignEmail(formData: FormData) {
  await requireRole(["OWNER", "LIMITED_ADMIN"]);
  const campaignId = String(formData.get("campaignId") ?? "");
  const subject = String(formData.get("subjectLine") ?? "").trim();
  const body = String(formData.get("bodyTemplate") ?? "").trim();
  const delayDays = Number(formData.get("delayDays") ?? 0) || 0;
  const autoFollowUp = formData.get("autoFollowUp") === "on";
  const followUpCondition = String(formData.get("followUpCondition") ?? "") as CampaignFollowUpCondition | "";

  if (!campaignId || !subject || !body) throw new Error("Missing fields");

  const last = await prisma.campaignEmail.findFirst({
    where: { campaignId },
    orderBy: { sequenceOrder: "desc" },
  });

  await prisma.campaignEmail.create({
    data: {
      campaignId,
      sequenceOrder: (last?.sequenceOrder ?? 0) + 1,
      subjectLine: subject,
      bodyTemplate: body,
      delayDays,
      autoFollowUp,
      followUpCondition: followUpCondition || null,
    },
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

/** Transition DRAFT → ACTIVE and enqueue initial recipients (step 1 only). */
export async function startCampaign(formData: FormData) {
  await requireRole(["OWNER", "LIMITED_ADMIN"]);
  const campaignId = String(formData.get("campaignId") ?? "");
  const filterJson = String(formData.get("targetFilter") ?? "{}");
  let filter: Record<string, unknown> = {};
  try { filter = JSON.parse(filterJson); } catch { filter = {}; }

  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    include: { emails: { orderBy: { sequenceOrder: "asc" }, take: 1 } },
  });
  if (!campaign) throw new Error("Not found");
  if (campaign.emails.length === 0) throw new Error("Add at least one email before starting.");

  // Resolve audience — company filter → contacts on those companies.
  const companyWhere: Prisma.CompanyWhereInput = { deletedAt: null };
  if (typeof filter.status === "string") companyWhere.status = filter.status as Prisma.CompanyWhereInput["status"];
  if (typeof filter.dealFlowTier === "string") companyWhere.dealFlowTier = filter.dealFlowTier as Prisma.CompanyWhereInput["dealFlowTier"];
  if (typeof filter.assignedRepId === "string") companyWhere.assignedRepId = filter.assignedRepId;
  // Exclude DNC companies + those with no email contacts.
  companyWhere.doNotEmail = false;
  const companies = await prisma.company.findMany({
    where: companyWhere,
    include: {
      contacts: {
        where: { doNotEmail: false, unsubscribedAt: null, email: { not: null } },
      },
    },
    take: 5000,
  });

  const firstEmail = campaign.emails[0];
  const data: Prisma.CampaignRecipientTrackingCreateManyInput[] = [];
  for (const co of companies) {
    // Prefer the primary contact, fall back to any with email.
    const contact = co.contacts.find((ct) => ct.isPrimaryContact) ?? co.contacts[0];
    if (!contact) continue;
    data.push({
      campaignId,
      campaignEmailId: firstEmail.id,
      companyId: co.id,
      contactId: contact.id,
      sendAfter: new Date(),
    });
  }

  if (data.length > 0) {
    // skipDuplicates handles the @@unique([campaignEmailId, contactId]) case for restarts.
    await prisma.campaignRecipientTracking.createMany({ data, skipDuplicates: true });
  }

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: "ACTIVE",
      targetFilter: filter as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/campaigns/${campaignId}`);
}

export async function pauseCampaign(formData: FormData) {
  await requireRole(["OWNER", "LIMITED_ADMIN"]);
  const campaignId = String(formData.get("campaignId") ?? "");
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { status: "PAUSED" },
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function resumeCampaign(formData: FormData) {
  await requireRole(["OWNER", "LIMITED_ADMIN"]);
  const campaignId = String(formData.get("campaignId") ?? "");
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { status: "ACTIVE" },
  });
  revalidatePath(`/campaigns/${campaignId}`);
}
