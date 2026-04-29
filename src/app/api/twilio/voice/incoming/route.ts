// Inbound call to a rep's Twilio business number.
// We respond with TwiML that forwards to the rep's personal cell and records the leg.
// Twilio sets this as the Voice "A CALL COMES IN" webhook on each rep's number.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forwardToRepTwiML, webhookBaseUrl, toE164 } from "@/lib/twilio";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const to = String(form.get("To") ?? ""); // the rep's Twilio number being called
  const from = String(form.get("From") ?? ""); // the external caller
  const callSid = String(form.get("CallSid") ?? "");

  const rep = await prisma.user.findUnique({ where: { twilioPhoneNumber: to } });
  if (!rep || !rep.phone) {
    return xml(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Sorry, the person you are trying to reach is not available right now. Please try again later.</Say></Response>`
    );
  }

  // Identify the company/contact by inbound number (best-effort)
  const fromNormalized = toE164(from) ?? from;
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

  // Create an Activity record up front so we have an ID to correlate callback events with.
  if (company) {
    await prisma.activity.create({
      data: {
        companyId: company.id,
        contactId: contact?.id,
        repId: rep.id,
        activityType: "CALL",
        direction: "INBOUND",
        subject: `Incoming call from ${fromNormalized}`,
        countsAsActivity: false, // flips to true once we see duration >= 30s
        callConnected: false,
      },
    });
  }

  // Check if two-party consent announcement is required (owner toggle in Global Settings)
  const consent = await prisma.globalSetting.findUnique({ where: { key: "two_party_consent_required" } });
  const consentRequired = consent?.value === true;

  const base = webhookBaseUrl();
  const twiml = forwardToRepTwiML({
    repPersonalNumber: rep.phone,
    callerId: from, // show the caller's number to the rep
    recordingCallbackUrl: `${base}/api/twilio/voice/recording?callSid=${callSid}&repId=${rep.id}${company ? `&companyId=${company.id}` : ""}${contact ? `&contactId=${contact.id}` : ""}`,
    statusCallbackUrl: `${base}/api/twilio/voice/status`,
    twoPartyConsentAnnouncement: consentRequired
      ? "This call may be recorded for quality and training purposes."
      : null,
  });

  return xml(twiml);
}

function xml(body: string) {
  return new NextResponse(body, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
