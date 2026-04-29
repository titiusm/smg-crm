// Called by Twilio when the rep picks up an outbound call we initiated.
// Returns TwiML to dial the intended contact and bridge them together.
import { NextRequest, NextResponse } from "next/server";
import { bridgeToContactTwiML, webhookBaseUrl } from "@/lib/twilio";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const to = url.searchParams.get("to") ?? "";
  const companyId = url.searchParams.get("companyId") ?? "";
  const repId = url.searchParams.get("repId") ?? "";
  const contactId = url.searchParams.get("contactId") ?? undefined;

  // Look up the rep's Twilio number so outgoing CallerID is the business line.
  const rep = repId ? await prisma.user.findUnique({ where: { id: repId } }) : null;
  const callerId = rep?.twilioPhoneNumber ?? "";

  const consent = await prisma.globalSetting.findUnique({ where: { key: "two_party_consent_required" } });
  const consentRequired = consent?.value === true;

  const base = webhookBaseUrl();
  const qs = new URLSearchParams({ companyId, repId });
  if (contactId) qs.set("contactId", contactId);

  const twiml = bridgeToContactTwiML({
    contactNumber: to,
    callerId,
    recordingCallbackUrl: `${base}/api/twilio/voice/recording?${qs.toString()}&direction=OUTBOUND`,
    statusCallbackUrl: `${base}/api/twilio/voice/status?${qs.toString()}`,
    twoPartyConsentAnnouncement: consentRequired
      ? "This call may be recorded for quality and training purposes."
      : null,
  });
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
