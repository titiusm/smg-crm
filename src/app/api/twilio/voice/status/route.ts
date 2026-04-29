// Twilio status callback — called as the call progresses (initiated, ringing, answered, completed).
// We update the Activity row on completion with duration + connected flag.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const url = new URL(req.url);
  const status = String(form.get("CallStatus") ?? "");
  const duration = parseInt(String(form.get("CallDuration") ?? "0"), 10) || 0;
  const callSid = String(form.get("CallSid") ?? "");
  const direction = (url.searchParams.get("direction") ?? "INBOUND") as "INBOUND" | "OUTBOUND";
  const companyId = url.searchParams.get("companyId") ?? undefined;
  const repId = url.searchParams.get("repId") ?? undefined;
  const contactId = url.searchParams.get("contactId") ?? undefined;

  if (status !== "completed" && status !== "no-answer" && status !== "busy" && status !== "failed") {
    return NextResponse.json({ ok: true }); // ignore in-flight events
  }

  // Find the matching Activity — inbound was created on pickup of the incoming route;
  // outbound is created on click-to-call initiation.  Correlate by subject containing CallSid if we set it,
  // otherwise by most recent call for this rep + company.
  if (companyId && repId) {
    const recent = await prisma.activity.findFirst({
      where: {
        companyId,
        repId,
        activityType: "CALL",
        direction,
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      const connected = status === "completed" && duration >= 30;
      await prisma.activity.update({
        where: { id: recent.id },
        data: {
          callDurationSeconds: duration || null,
          callConnected: connected,
          countsAsActivity: connected, // spec §6: 30+s OR voicemail counts
          detailedNotes: `${recent.detailedNotes ?? ""}\nStatus: ${status}${duration ? ` (${duration}s)` : ""}${contactId ? `` : ""}`.trim(),
        },
      });
      // Bump last-contacted on the company
      await prisma.company.update({
        where: { id: companyId },
        data: { dateLastContacted: new Date() },
      });
    }
  }

  // Acknowledge; no TwiML needed
  return new NextResponse("", { headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
