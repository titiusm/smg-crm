// Campaign drip runner — drains QUEUED recipients whose sendAfter <= now.
// Call from Vercel Cron, a cron job, or manually via the "Run tick" button.
// Respects daily_campaign_sending_limit from Global Settings.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendIndividualEmail, renderTemplate } from "@/lib/sendgrid";
import type { Prisma } from "@prisma/client";

async function authorizeTick(req: NextRequest): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Vercel Cron sends GET with `Authorization: Bearer $CRON_SECRET`.
  const cronSecret = process.env.CRON_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  if (cronSecret && auth === `Bearer ${cronSecret}`) return { ok: true };

  // External cron (e.g., curl in dev) can use the X-Tick-Token shared secret.
  const tickToken = process.env.CAMPAIGN_TICK_TOKEN || "";
  const headerToken = req.headers.get("x-tick-token") || "";
  if (tickToken && headerToken === tickToken) return { ok: true };

  // Manual trigger via the UI: require an authenticated owner / admin session.
  const { auth: getSession } = await import("@/auth");
  const session = await getSession();
  if (session?.user && (session.user.role === "OWNER" || session.user.role === "LIMITED_ADMIN")) {
    return { ok: true };
  }
  return { ok: false, reason: "forbidden" };
}

export async function GET(req: NextRequest) {
  return runTick(req);
}

export async function POST(req: NextRequest) {
  return runTick(req);
}

async function runTick(req: NextRequest) {
  const ok = await authorizeTick(req);
  if (!ok.ok) return NextResponse.json({ error: ok.reason }, { status: 403 });

  // Find today's send count vs. daily limit.
  const settingsRow = await prisma.globalSetting.findUnique({ where: { key: "daily_campaign_sending_limit" } });
  const dailyLimit = typeof settingsRow?.value === "number" ? settingsRow.value : 50;
  const physicalRow = await prisma.globalSetting.findUnique({ where: { key: "company_physical_address" } });
  const physical = typeof physicalRow?.value === "string" ? physicalRow.value : "";
  if (!physical) return NextResponse.json({ error: "Missing company_physical_address setting" }, { status: 400 });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sentToday = await prisma.campaignRecipientTracking.count({
    where: { sentAt: { gte: todayStart } },
  });
  const remaining = Math.max(0, dailyLimit - sentToday);
  if (remaining === 0) {
    return NextResponse.json({ ok: true, skipped: "daily limit reached", sentToday });
  }

  // Find ready recipients (only in ACTIVE campaigns).
  const queue = await prisma.campaignRecipientTracking.findMany({
    where: {
      status: "QUEUED",
      sendAfter: { lte: new Date() },
      campaign: { status: "ACTIVE" },
    },
    include: {
      campaign: true,
      campaignEmail: true,
      company: true,
      contact: true,
    },
    orderBy: { sendAfter: "asc" },
    take: remaining,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of queue) {
    // Re-check DNC at send time (opt-outs can happen between enqueue and send).
    if (row.contact.doNotEmail || row.contact.unsubscribedAt) {
      await prisma.campaignRecipientTracking.update({
        where: { id: row.id },
        data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
      });
      skipped++;
      continue;
    }
    if (!row.contact.email) {
      await prisma.campaignRecipientTracking.update({
        where: { id: row.id },
        data: { status: "FAILED" },
      });
      skipped++;
      continue;
    }

    const vars = {
      company_name: row.company.companyName,
      contact_first_name: row.contact.firstName,
      contact_name: [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" "),
    };

    const result = await sendIndividualEmail({
      to: row.contact.email,
      subject: renderTemplate(row.campaignEmail.subjectLine, vars),
      html: renderTemplate(row.campaignEmail.bodyTemplate, vars),
      contactId: row.contact.id,
      physicalAddress: physical,
      categories: ["campaign", row.campaignId],
      customArgs: {
        campaignId: row.campaignId,
        campaignEmailId: row.campaignEmailId,
        contactId: row.contact.id,
        companyId: row.company.id,
      },
    });

    if ("error" in result) {
      await prisma.campaignRecipientTracking.update({
        where: { id: row.id },
        data: { status: "FAILED" },
      });
      failed++;
      continue;
    }

    await prisma.campaignRecipientTracking.update({
      where: { id: row.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        sendgridMessageId: result.messageId,
      },
    });

    // If there's a follow-up step, enqueue it after `delayDays`.
    const next = await prisma.campaignEmail.findFirst({
      where: {
        campaignId: row.campaignId,
        sequenceOrder: { gt: row.campaignEmail.sequenceOrder },
      },
      orderBy: { sequenceOrder: "asc" },
    });
    if (next) {
      const sendAfter = new Date();
      sendAfter.setDate(sendAfter.getDate() + (next.delayDays || 0));
      const nextData: Prisma.CampaignRecipientTrackingCreateInput = {
        campaign: { connect: { id: row.campaignId } },
        campaignEmail: { connect: { id: next.id } },
        company: { connect: { id: row.companyId } },
        contact: { connect: { id: row.contactId } },
        sendAfter,
      };
      try {
        await prisma.campaignRecipientTracking.create({ data: nextData });
      } catch {
        // unique violation: already queued (e.g., from restart). Ignore.
      }
    }

    sent++;
  }

  return NextResponse.json({ ok: true, sent, failed, skipped, remaining });
}
