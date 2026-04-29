// Twilio recording status callback — called when a recording becomes available.
// We attach the recording URL to the matching Activity row.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const url = new URL(req.url);
  const recordingUrl = String(form.get("RecordingUrl") ?? "");
  const recordingStatus = String(form.get("RecordingStatus") ?? "");
  const companyId = url.searchParams.get("companyId") ?? undefined;
  const repId = url.searchParams.get("repId") ?? undefined;

  if (recordingStatus !== "completed" || !recordingUrl || !companyId || !repId) {
    return NextResponse.json({ ok: true });
  }

  // Twilio recording URLs need ".mp3" suffix to stream MP3.
  const mp3Url = recordingUrl.endsWith(".mp3") ? recordingUrl : `${recordingUrl}.mp3`;

  const recent = await prisma.activity.findFirst({
    where: {
      companyId,
      repId,
      activityType: "CALL",
      callRecordingUrl: null,
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    await prisma.activity.update({
      where: { id: recent.id },
      data: { callRecordingUrl: mp3Url },
    });
  }
  return NextResponse.json({ ok: true });
}
