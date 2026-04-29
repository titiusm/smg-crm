// SendGrid Event Webhook — processes delivery, open, click, bounce, unsubscribe events
// and updates the matching Activity / CampaignRecipientTracking rows.
// Signed-webhook verification is optional; see SETUP-PHASE-1C.md for signing key setup.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { EmailDeliveryStatus } from "@prisma/client";

interface SendGridEvent {
  email: string;
  timestamp: number;
  event: string;              // "processed" | "delivered" | "open" | "click" | "bounce" | "dropped" | "unsubscribe" | "spamreport"
  sg_message_id?: string;
  companyId?: string;
  contactId?: string;
  repId?: string;
  campaignId?: string;
  campaignEmailId?: string;
  category?: string | string[];
}

export async function POST(req: NextRequest) {
  const events = (await req.json()) as SendGridEvent[];
  if (!Array.isArray(events)) return NextResponse.json({ ok: false }, { status: 400 });

  for (const e of events) {
    try {
      await handleEvent(e);
    } catch (err) {
      console.error("[sendgrid webhook] failed to handle event", e.event, err);
    }
  }
  return NextResponse.json({ ok: true });
}

async function handleEvent(e: SendGridEvent) {
  const mapped: EmailDeliveryStatus | null =
    e.event === "delivered" ? "DELIVERED" :
    e.event === "open" ? "OPENED" :
    e.event === "click" ? "CLICKED" :
    e.event === "bounce" ? "BOUNCED" :
    null;

  // Individual (one-off) send — update the last matching Activity.
  if (e.companyId && mapped) {
    await prisma.activity.updateMany({
      where: {
        companyId: e.companyId,
        contactId: e.contactId,
        activityType: "EMAIL",
        direction: "OUTBOUND",
        emailDeliveryStatus: mapped === "OPENED" || mapped === "CLICKED"
          ? { in: ["SENT", "DELIVERED"] }
          : "SENT",
      },
      data: {
        emailDeliveryStatus: mapped,
        countsAsActivity: mapped === "DELIVERED" || mapped === "OPENED" || mapped === "CLICKED",
      },
    });
  }

  // Campaign recipient — update tracking row.
  if (e.campaignId && e.contactId && e.campaignEmailId) {
    const now = new Date(e.timestamp * 1000);
    const updates: Record<string, unknown> = {};
    if (e.event === "delivered") { updates.status = "DELIVERED"; updates.deliveredAt = now; }
    if (e.event === "open") { updates.status = "OPENED"; updates.openedAt = now; }
    if (e.event === "click") { updates.status = "CLICKED"; updates.clickedAt = now; }
    if (e.event === "bounce" || e.event === "dropped") { updates.status = "BOUNCED"; updates.bouncedAt = now; }
    if (e.event === "unsubscribe" || e.event === "spamreport") {
      updates.status = "UNSUBSCRIBED";
      updates.unsubscribedAt = now;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.campaignRecipientTracking.updateMany({
        where: {
          campaignId: e.campaignId,
          campaignEmailId: e.campaignEmailId,
          contactId: e.contactId,
        },
        data: updates,
      });
    }

    // Honor unsubscribe: flip doNotEmail on the contact.
    if (e.event === "unsubscribe" || e.event === "spamreport") {
      await prisma.contact.update({
        where: { id: e.contactId },
        data: { doNotEmail: true, unsubscribedAt: now },
      });
    }
  }
}
