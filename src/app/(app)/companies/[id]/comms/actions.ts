"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/auth";
import { isScopedToOwnCompanies } from "@/lib/rbac";
import { bridgeCall, sendSms, toE164 } from "@/lib/twilio";
import { sendIndividualEmail, renderTemplate } from "@/lib/sendgrid";

async function loadCompany(userId: string, role: string, companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { contacts: { where: { isPrimaryContact: true }, take: 1 } },
  });
  if (!company || company.deletedAt) throw new Error("Not found");
  if (isScopedToOwnCompanies(role as "SALES_REP") && company.assignedRepId !== userId) {
    throw new Error("FORBIDDEN");
  }
  return company;
}

export async function initiateCall(formData: FormData) {
  const session = await requireSession();
  const companyId = String(formData.get("companyId") ?? "");
  const contactId = String(formData.get("contactId") ?? "") || null;
  const company = await loadCompany(session.user.id, session.user.role, companyId);

  if (company.doNotCall) throw new Error("This company is flagged Do Not Call.");
  const contact = contactId ? await prisma.contact.findUnique({ where: { id: contactId } }) : null;
  if (contact?.doNotCall) throw new Error("This contact is flagged Do Not Call.");

  const rep = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!rep?.twilioPhoneNumber) throw new Error("Your account does not have a Twilio number assigned yet.");
  if (!rep.phone) throw new Error("Set your personal forwarding phone number on your User record.");

  const toRaw = contact?.phoneNumber ?? company.phoneNumber;
  const to = toE164(toRaw);
  if (!to) throw new Error("No valid phone number on file for this company.");

  // Create the activity up front so webhooks have something to attach to.
  await prisma.activity.create({
    data: {
      companyId: company.id,
      contactId: contact?.id,
      repId: rep.id,
      activityType: "CALL",
      direction: "OUTBOUND",
      subject: `Outbound call to ${to}`,
      countsAsActivity: false, // flips true once status callback sees duration ≥ 30s
      callConnected: false,
    },
  });

  await bridgeCall({
    fromTwilioNumber: rep.twilioPhoneNumber,
    repPersonalNumber: rep.phone,
    toNumber: to,
    metadata: { companyId: company.id, contactId: contact?.id ?? null, repId: rep.id },
  });

  await prisma.company.update({ where: { id: company.id }, data: { dateLastContacted: new Date() } });
  revalidatePath(`/companies/${company.id}`);
}

export async function sendText(formData: FormData) {
  const session = await requireSession();
  const companyId = String(formData.get("companyId") ?? "");
  const contactId = String(formData.get("contactId") ?? "") || null;
  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("Empty message");
  if (body.length > 1600) throw new Error("Text too long (max 1600 chars).");

  const company = await loadCompany(session.user.id, session.user.role, companyId);
  if (company.doNotText) throw new Error("This company is flagged Do Not Text.");
  const contact = contactId ? await prisma.contact.findUnique({ where: { id: contactId } }) : null;
  if (contact?.doNotText) throw new Error("This contact is flagged Do Not Text.");

  const rep = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!rep?.twilioPhoneNumber) throw new Error("Your account does not have a Twilio number assigned yet.");
  const toRaw = contact?.phoneNumber ?? company.phoneNumber;
  const to = toE164(toRaw);
  if (!to) throw new Error("No valid phone number on file.");

  const msg = await sendSms({
    fromTwilioNumber: rep.twilioPhoneNumber,
    toNumber: to,
    body,
  });

  // Record the outbound text; SID is stashed in subject so the status webhook can correlate.
  await prisma.activity.create({
    data: {
      companyId: company.id,
      contactId: contact?.id,
      repId: rep.id,
      activityType: "TEXT",
      direction: "OUTBOUND",
      subject: `SMS ${msg.sid}`,
      detailedNotes: body,
      textDeliveryStatus: "SENT",
      countsAsActivity: false, // flips to true on DELIVERED callback
    },
  });
  await prisma.company.update({ where: { id: company.id }, data: { dateLastContacted: new Date() } });

  revalidatePath(`/companies/${company.id}`);
}

export async function sendEmailNow(formData: FormData) {
  const session = await requireSession();
  const companyId = String(formData.get("companyId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const bodyHtml = String(formData.get("body") ?? "").trim();
  if (!subject || !bodyHtml || !contactId) throw new Error("Subject, body, and contact are required.");

  const company = await loadCompany(session.user.id, session.user.role, companyId);
  if (company.doNotEmail) throw new Error("This company is flagged Do Not Email.");
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.companyId !== company.id) throw new Error("Contact not found.");
  if (contact.doNotEmail || contact.unsubscribedAt) throw new Error("This contact is flagged Do Not Email.");
  if (!contact.email) throw new Error("Contact has no email on file.");

  const physSetting = await prisma.globalSetting.findUnique({ where: { key: "company_physical_address" } });
  const physical = typeof physSetting?.value === "string" && physSetting.value
    ? physSetting.value
    : "";
  if (!physical) throw new Error("Set your company physical address in Settings first (required for CAN-SPAM).");

  const rep = await prisma.user.findUnique({ where: { id: session.user.id } });
  const mergedSubject = renderTemplate(subject, {
    company_name: company.companyName,
    contact_first_name: contact.firstName,
    contact_name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
    rep_name: rep ? `${rep.firstName} ${rep.lastName}` : "",
    rep_email: rep?.email ?? "",
  });
  const mergedHtml = renderTemplate(bodyHtml, {
    company_name: company.companyName,
    contact_first_name: contact.firstName,
    contact_name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
    rep_name: rep ? `${rep.firstName} ${rep.lastName}` : "",
    rep_email: rep?.email ?? "",
    rep_phone: rep?.phone ?? "",
  });

  const result = await sendIndividualEmail({
    to: contact.email,
    subject: mergedSubject,
    html: mergedHtml,
    contactId: contact.id,
    physicalAddress: physical,
    categories: ["individual-send"],
    customArgs: {
      companyId: company.id,
      contactId: contact.id,
      repId: session.user.id,
    },
  });

  if ("error" in result) throw new Error(`SendGrid error: ${result.error}`);

  await prisma.activity.create({
    data: {
      companyId: company.id,
      contactId: contact.id,
      repId: session.user.id,
      activityType: "EMAIL",
      direction: "OUTBOUND",
      subject: mergedSubject,
      detailedNotes: mergedHtml,
      emailDeliveryStatus: "SENT",
      countsAsActivity: false, // flips once webhook reports DELIVERED
    },
  });
  await prisma.company.update({ where: { id: company.id }, data: { dateLastContacted: new Date() } });

  revalidatePath(`/companies/${company.id}`);
}
