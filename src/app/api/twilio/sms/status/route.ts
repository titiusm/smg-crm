// Twilio SMS delivery status — updates the outbound Activity row.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { TextDeliveryStatus } from "@prisma/client";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const sid = String(form.get("MessageSid") ?? "");
  const status = String(form.get("MessageStatus") ?? ""); // queued, sent, delivered, failed, undelivered
  if (!sid) return NextResponse.json({ ok: true });

  const mapped: TextDeliveryStatus | null =
    status === "delivered" ? "DELIVERED" :
    status === "sent" ? "SENT" :
    status === "failed" || status === "undelivered" ? "FAILED" : null;
  if (!mapped) return NextResponse.json({ ok: true });

  await prisma.activity.updateMany({
    where: { activityType: "TEXT", direction: "OUTBOUND", subject: { contains: sid } },
    data: {
      textDeliveryStatus: mapped,
      countsAsActivity: mapped === "DELIVERED",
    },
  });
  return NextResponse.json({ ok: true });
}
