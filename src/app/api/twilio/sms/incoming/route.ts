// Inbound SMS webhook.
// - Logs the message as an Activity
// - Processes STOP / UNSUBSCRIBE / CANCEL keywords by flipping doNotText on the contact + company
// - Returns empty TwiML so Twilio doesn't auto-reply (STOP auto-replies are handled by Twilio)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";

const STOP_KEYWORDS = new Set(["STOP", "UNSUBSCRIBE", "CANCEL", "STOPALL", "QUIT", "END"]);

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const to = String(form.get("To") ?? ""); // the rep's Twilio number
  const from = String(form.get("From") ?? ""); // external contact
  const body = String(form.get("Body") ?? "").trim();

  const rep = await prisma.user.findUnique({ where: { twilioPhoneNumber: to } });
  const digits = from.replace(/\D+/g, "");
  const contact = digits.length >= 7
    ? await prisma.contact.findFirst({
        where: { phoneNumber: { contains: digits.slice(-10) } },
        include: { company: true },
      })
    : null;
  const company = contact?.company ??
    (digits.length >= 7
      ? await prisma.company.findFirst({ where: { phoneNumber: { contains: digits.slice(-10) }, deletedAt: null } })
      : null);

  const isStop = STOP_KEYWORDS.has(body.toUpperCase().split(/\s+/)[0] ?? "");
  if (isStop && (contact || company)) {
    if (contact) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { doNotText: true },
      });
      await recordAudit({
        userId: null,
        actionType: "DNC_FLAG_CHANGED",
        entityType: "CONTACT",
        entityId: contact.id,
        newValue: { doNotText: true, source: "INBOUND_STOP" },
        reason: "STOP keyword received via SMS",
      });
    }
    if (company) {
      await prisma.company.update({
        where: { id: company.id },
        data: { doNotText: true },
      });
      await recordAudit({
        userId: null,
        actionType: "DNC_FLAG_CHANGED",
        entityType: "COMPANY",
        entityId: company.id,
        newValue: { doNotText: true, source: "INBOUND_STOP" },
        reason: "STOP keyword received via SMS",
      });
    }
  }

  if (company) {
    await prisma.activity.create({
      data: {
        companyId: company.id,
        contactId: contact?.id,
        repId: rep?.id ?? null,
        activityType: "TEXT",
        direction: "INBOUND",
        subject: `Incoming SMS from ${from}`,
        detailedNotes: body,
        textDeliveryStatus: "DELIVERED",
        countsAsActivity: false, // inbound doesn't count toward outreach goals
      },
    });
    await prisma.company.update({
      where: { id: company.id },
      data: { dateLastContacted: new Date() },
    });
  }

  // Empty TwiML = no auto-reply.
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { headers: { "Content-Type": "text/xml; charset=utf-8" } }
  );
}
