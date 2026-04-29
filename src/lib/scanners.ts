// Scanner helpers — detect companies / reps that need attention, create notifications.
// De-duped via NotificationScanToken so the same subject doesn't fire every run.
import { prisma } from "@/lib/prisma";
import { subDays } from "date-fns";

type ScanKind = "dormant" | "followup_due" | "high_value" | "rep_inactive";

/** Fire a notification for this (kind, subject) pair unless one was fired within `cooloffDays`. */
async function fireOnce(
  kind: ScanKind,
  subjectId: string,
  cooloffDays: number,
  payload: {
    userId: string;
    type: "DORMANT_COMPANY" | "FOLLOW_UP_DUE" | "CUSTOM" | "REP_INACTIVE";
    title: string;
    message: string;
    entityType?: string;
    entityId?: string;
  }
): Promise<boolean> {
  const recent = await prisma.notificationScanToken.findUnique({
    where: { kind_subjectId: { kind, subjectId } },
  });
  if (recent && recent.firedAt > subDays(new Date(), cooloffDays)) return false;

  await prisma.notification.create({
    data: {
      userId: payload.userId,
      notificationType: payload.type,
      title: payload.title,
      message: payload.message,
      relatedEntityType: payload.entityType ?? null,
      relatedEntityId: payload.entityId ?? null,
    },
  });
  await prisma.notificationScanToken.upsert({
    where: { kind_subjectId: { kind, subjectId } },
    update: { firedAt: new Date() },
    create: { kind, subjectId, firedAt: new Date() },
  });
  return true;
}

/** Settings readers with fallbacks. */
async function settings(): Promise<{
  dormantDays: number;
  followUpDays: number;
  repInactiveDays: number;
  highValueReviews: number;
}> {
  const rows = await prisma.globalSetting.findMany({
    where: {
      key: {
        in: [
          "dormant_threshold_days",
          "follow_up_interval_days",
          "rep_inactive_threshold_days",
          "high_value_review_threshold",
        ],
      },
    },
  });
  const get = (k: string, fallback: number): number => {
    const v = rows.find((r) => r.key === k)?.value;
    return typeof v === "number" ? v : fallback;
  };
  return {
    dormantDays: get("dormant_threshold_days", 90),
    followUpDays: get("follow_up_interval_days", 14),
    repInactiveDays: get("rep_inactive_threshold_days", 2),
    highValueReviews: get("high_value_review_threshold", 100),
  };
}

export interface ScanSummary {
  dormantFired: number;
  followUpFired: number;
  highValueFired: number;
  repInactiveFired: number;
}

/** Run all scanners. Call this from a manual button or a cron route. */
export async function runAllScanners(): Promise<ScanSummary> {
  const { dormantDays, followUpDays, repInactiveDays, highValueReviews } = await settings();
  const owners = await prisma.user.findMany({ where: { role: "OWNER", isActive: true }, select: { id: true } });
  const ownerIds = owners.map((o) => o.id);

  // 1) Dormant companies — 3+ months since last project.
  const dormantCutoff = subDays(new Date(), dormantDays);
  const dormant = await prisma.company.findMany({
    where: {
      deletedAt: null,
      dateLastProject: { lt: dormantCutoff, not: null },
      status: { not: "CLOSED_INACTIVE" },
    },
    include: { assignedRep: true },
  });
  let dormantFired = 0;
  for (const c of dormant) {
    const targets = new Set<string>([...ownerIds, ...(c.assignedRepId ? [c.assignedRepId] : [])]);
    for (const uid of targets) {
      const ok = await fireOnce("dormant", `${uid}:${c.id}`, 14, {
        userId: uid,
        type: "DORMANT_COMPANY",
        title: `Dormant: ${c.companyName}`,
        message: `No project in ${daysSince(c.dateLastProject!)} days. Worth a re-engagement call.`,
        entityType: "COMPANY",
        entityId: c.id,
      });
      if (ok) dormantFired++;
    }
  }

  // 2) Follow-up due — "Agreed to Use Us" companies with no job sent in `followUpDays`.
  const followUpCutoff = subDays(new Date(), followUpDays);
  const agreed = await prisma.company.findMany({
    where: {
      deletedAt: null,
      status: "AGREED_TO_USE_US",
      jobs: { none: {} },
      OR: [{ dateLastContacted: { lt: followUpCutoff } }, { dateLastContacted: null }],
    },
  });
  let followUpFired = 0;
  for (const c of agreed) {
    const uid = c.assignedRepId ?? ownerIds[0];
    if (!uid) continue;
    const ok = await fireOnce("followup_due", c.id, followUpDays, {
      userId: uid,
      type: "FOLLOW_UP_DUE",
      title: `Follow up with ${c.companyName}`,
      message: `Agreed to Use Us but hasn't sent a job yet. Check in.`,
      entityType: "COMPANY",
      entityId: c.id,
    });
    if (ok) followUpFired++;
  }

  // 3) High-value prospects — 100+ Google reviews and never contacted.
  const highValue = await prisma.company.findMany({
    where: {
      deletedAt: null,
      googleReviewCount: { gte: highValueReviews },
      dateFirstContacted: null,
    },
    take: 50,
  });
  let highValueFired = 0;
  for (const c of highValue) {
    const uid = c.assignedRepId ?? ownerIds[0];
    if (!uid) continue;
    const ok = await fireOnce("high_value", c.id, 30, {
      userId: uid,
      type: "CUSTOM",
      title: `High-value prospect: ${c.companyName}`,
      message: `${c.googleReviewCount} Google reviews and never contacted.`,
      entityType: "COMPANY",
      entityId: c.id,
    });
    if (ok) highValueFired++;
  }

  // 4) Rep inactivity — no logged activity in N days.
  const repCutoff = subDays(new Date(), repInactiveDays);
  const reps = await prisma.user.findMany({ where: { role: "SALES_REP", isActive: true } });
  let repInactiveFired = 0;
  for (const rep of reps) {
    const lastActivity = await prisma.activity.findFirst({
      where: { repId: rep.id, createdAt: { gt: repCutoff } },
      select: { id: true },
    });
    if (lastActivity) continue;
    for (const uid of ownerIds) {
      const ok = await fireOnce("rep_inactive", `${uid}:${rep.id}`, repInactiveDays, {
        userId: uid,
        type: "REP_INACTIVE",
        title: `Rep inactive: ${rep.firstName} ${rep.lastName}`,
        message: `No activity logged in the last ${repInactiveDays} days.`,
        entityType: "USER",
        entityId: rep.id,
      });
      if (ok) repInactiveFired++;
    }
  }

  return { dormantFired, followUpFired, highValueFired, repInactiveFired };
}

function daysSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// ----------------------------------------------------------------------------
// Metrics helpers for widgets / dashboards
// ----------------------------------------------------------------------------

export async function funnelMetrics(scopeRepId?: string | null) {
  const where = scopeRepId ? { assignedRepId: scopeRepId, deletedAt: null } : { deletedAt: null };
  const [
    totalContacted,
    totalInterested,
    totalAgreed,
    totalFirstJob,
    totalRepeat,
  ] = await Promise.all([
    prisma.company.count({ where: { ...where, dateFirstContacted: { not: null } } }),
    prisma.company.count({ where: { ...where, status: { in: ["INTERESTED", "AGREED_TO_USE_US", "FIRST_JOB_SENT", "REPEAT_CUSTOMER"] } } }),
    prisma.company.count({ where: { ...where, status: { in: ["AGREED_TO_USE_US", "FIRST_JOB_SENT", "REPEAT_CUSTOMER"] } } }),
    prisma.company.count({ where: { ...where, status: { in: ["FIRST_JOB_SENT", "REPEAT_CUSTOMER"] } } }),
    prisma.company.count({ where: { ...where, status: "REPEAT_CUSTOMER" } }),
  ]);
  return { totalContacted, totalInterested, totalAgreed, totalFirstJob, totalRepeat };
}

export async function repActivityCounts(repId: string, sinceDays: number) {
  const since = subDays(new Date(), sinceDays);
  const [calls, texts, emails, meetings] = await Promise.all([
    prisma.activity.count({
      where: { repId, activityType: "CALL", createdAt: { gte: since }, countsAsActivity: true },
    }),
    prisma.activity.count({
      where: { repId, activityType: "TEXT", createdAt: { gte: since }, countsAsActivity: true },
    }),
    prisma.activity.count({
      where: { repId, activityType: "EMAIL", createdAt: { gte: since }, countsAsActivity: true },
    }),
    prisma.activity.count({
      where: { repId, activityType: "MEETING", createdAt: { gte: since } },
    }),
  ]);
  return { calls, texts, emails, meetings };
}
