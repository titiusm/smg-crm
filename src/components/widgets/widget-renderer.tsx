import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { JOB_STATUS_LABEL, JOB_STATUS_ORDER } from "@/lib/jobs";
import {
  currentQuarterString,
  formatQuarter,
  computeQuarterlyCommission,
  parseStructure,
} from "@/lib/commission";
import { scopedCompanyWhere, DEAL_FLOW_TIER_LABEL } from "@/lib/companies";
import { repActivityCounts } from "@/lib/scanners";
import { subDays } from "date-fns";
import type { WidgetType } from "@/lib/widgets";
import type { Role } from "@prisma/client";

interface Ctx {
  userId: string;
  role: Role;
}

export async function renderWidget(type: WidgetType, ctx: Ctx): Promise<React.ReactNode> {
  switch (type) {
    case "pipeline_value_by_stage":
      return PipelineByStage(ctx);
    case "rep_performance":
      return RepPerformance();
    case "quarterly_revenue_trend":
      return QuarterlyRevenueTrend();
    case "dormant_companies":
      return DormantCompanies(ctx);
    case "pending_approvals":
      return PendingApprovals();
    case "high_value_prospects":
      return HighValueProspects(ctx);
    case "activity_leaderboard":
      return ActivityLeaderboard();
    case "campaign_performance":
      return CampaignPerformance();
    case "my_next_actions":
      return MyNextActions(ctx);
    case "my_quick_stats":
      return MyQuickStats(ctx);
  }
}

// ----------------------------------------------------------------------------
// Owner widgets
// ----------------------------------------------------------------------------

async function PipelineByStage(ctx: Ctx) {
  const jobs = await prisma.job.findMany({
    where: { deletedAt: null, company: scopedCompanyWhere(ctx) },
    select: { status: true, subcontractorEstimateTotal: true },
  });
  const byStage = new Map<string, { count: number; total: number }>();
  for (const s of JOB_STATUS_ORDER) byStage.set(s, { count: 0, total: 0 });
  for (const j of jobs) {
    const bucket = byStage.get(j.status);
    if (!bucket) continue;
    bucket.count++;
    bucket.total += Number(j.subcontractorEstimateTotal ?? 0);
  }
  const max = Math.max(1, ...Array.from(byStage.values()).map((b) => b.total));

  return (
    <Card className="h-full">
      <CardHeader><CardTitle>Pipeline by stage</CardTitle></CardHeader>
      <CardBody className="space-y-2">
        {JOB_STATUS_ORDER.map((s) => {
          const b = byStage.get(s)!;
          const pct = (b.total / max) * 100;
          return (
            <div key={s}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-(--color-muted-foreground)">{JOB_STATUS_LABEL[s]}</span>
                <span className="font-medium">${b.total.toLocaleString(undefined, { maximumFractionDigits: 0 })} · {b.count}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-(--color-muted) overflow-hidden">
                <div className="h-full rounded-full bg-(--color-accent)" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

async function RepPerformance() {
  const reps = await prisma.user.findMany({
    where: { role: "SALES_REP", isActive: true },
    orderBy: { firstName: "asc" },
  });
  const quarter = currentQuarterString();
  const rows = await Promise.all(
    reps.map(async (r) => {
      const [revenueAgg, activity] = await Promise.all([
        prisma.job.aggregate({
          where: { assignedRepId: r.id, commissionQuarter: quarter, status: { not: "CANCELLED" } },
          _sum: { subcontractorEstimateTotal: true },
        }),
        repActivityCounts(r.id, 7),
      ]);
      const revenue = Number(revenueAgg._sum.subcontractorEstimateTotal ?? 0);
      const { effectiveRate, totalCommission } = computeQuarterlyCommission(revenue, parseStructure(r.commissionStructure));
      return { rep: r, revenue, effectiveRate, totalCommission, activity };
    })
  );

  return (
    <Card className="h-full">
      <CardHeader><CardTitle>Rep performance — {formatQuarter(quarter)}</CardTitle></CardHeader>
      <CardBody className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-(--color-border) text-[11px] uppercase tracking-wide text-(--color-muted-foreground)">
            <tr><th className="px-3 py-2 text-left">Rep</th><th className="px-3 py-2 text-right">Revenue</th><th className="px-3 py-2 text-right">Tier</th><th className="px-3 py-2 text-right">7d activity</th></tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {rows.map((r) => (
              <tr key={r.rep.id}>
                <td className="px-3 py-2 font-medium">{r.rep.firstName} {r.rep.lastName}</td>
                <td className="px-3 py-2 text-right">${r.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td className="px-3 py-2 text-right"><Badge variant="accent">{(r.effectiveRate * 100).toFixed(0)}%</Badge></td>
                <td className="px-3 py-2 text-right text-xs">
                  {r.activity.calls}c / {r.activity.texts}t / {r.activity.emails}e / {r.activity.meetings}m
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td className="px-3 py-4 text-center text-xs text-(--color-muted-foreground)" colSpan={4}>No reps yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}

async function QuarterlyRevenueTrend() {
  // Last 6 quarters
  const quarters: string[] = [];
  const now = new Date();
  let y = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < 6; i++) { quarters.unshift(`${y}-Q${q}`); q -= 1; if (q < 1) { q = 4; y -= 1; } }

  const jobs = await prisma.job.groupBy({
    by: ["commissionQuarter"],
    where: { commissionQuarter: { in: quarters }, status: { not: "CANCELLED" } },
    _sum: { subcontractorEstimateTotal: true },
  });
  const byQ = new Map(jobs.map((j) => [j.commissionQuarter!, Number(j._sum.subcontractorEstimateTotal ?? 0)]));
  const max = Math.max(1, ...Array.from(byQ.values()), 500_000);

  return (
    <Card className="h-full">
      <CardHeader><CardTitle>Quarterly revenue trend</CardTitle></CardHeader>
      <CardBody>
        <div className="flex h-36 items-end gap-2">
          {quarters.map((q) => {
            const v = byQ.get(q) ?? 0;
            const pct = (v / max) * 100;
            return (
              <div key={q} className="flex flex-1 flex-col items-center gap-1">
                <div className="text-[10px] text-(--color-muted-foreground)">
                  ${(v / 1000).toFixed(0)}k
                </div>
                <div className="w-full flex-1 flex items-end">
                  <div className="w-full rounded-t-md bg-(--color-accent)/70" style={{ height: `${pct}%` }} />
                </div>
                <div className="text-[10px] text-(--color-muted-foreground)">{formatQuarter(q)}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-[11px] text-(--color-muted-foreground)">
          Tier thresholds: $250k (12%), $375k (13%), $500k (14%).
        </div>
      </CardBody>
    </Card>
  );
}

async function DormantCompanies(ctx: Ctx) {
  const cutoff = subDays(new Date(), 90);
  const dormant = await prisma.company.findMany({
    where: {
      ...scopedCompanyWhere(ctx),
      dateLastProject: { lt: cutoff, not: null },
      status: { not: "CLOSED_INACTIVE" },
    },
    orderBy: { dateLastProject: "asc" },
    take: 10,
  });
  return (
    <Card className="h-full">
      <CardHeader><CardTitle>Dormant</CardTitle></CardHeader>
      <CardBody className="p-0">
        {dormant.length === 0 ? (
          <div className="px-5 py-6 text-center text-xs text-(--color-muted-foreground)">None.</div>
        ) : (
          <ul className="divide-y divide-(--color-border) text-sm">
            {dormant.map((c) => (
              <li key={c.id} className="px-4 py-2">
                <Link href={`/companies/${c.id}`} className="block hover:text-(--color-accent)">
                  <div className="truncate font-medium">{c.companyName}</div>
                  <div className="text-[11px] text-(--color-muted-foreground)">
                    {daysSince(c.dateLastProject!)} days since last project
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

async function PendingApprovals() {
  const jobs = await prisma.job.findMany({
    where: { approvalStatus: "PENDING", deletedAt: null },
    include: { company: true },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  return (
    <Card className="h-full">
      <CardHeader><CardTitle>Pending approvals</CardTitle></CardHeader>
      <CardBody className="p-0">
        {jobs.length === 0 ? (
          <div className="px-5 py-6 text-center text-xs text-(--color-muted-foreground)">All clear.</div>
        ) : (
          <ul className="divide-y divide-(--color-border) text-sm">
            {jobs.map((j) => (
              <li key={j.id} className="px-4 py-2">
                <Link href={`/jobs/${j.id}`} className="block hover:text-(--color-accent)">
                  <div className="truncate font-medium">{j.company.companyName}</div>
                  <div className="text-[11px] text-(--color-warning)">
                    ${Number(j.pricePerPanel ?? 0).toFixed(2)}/panel
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

async function HighValueProspects(ctx: Ctx) {
  const rows = await prisma.company.findMany({
    where: {
      ...scopedCompanyWhere(ctx),
      googleReviewCount: { gte: 100 },
      dateFirstContacted: null,
    },
    orderBy: { googleReviewCount: "desc" },
    take: 10,
  });
  return (
    <Card className="h-full">
      <CardHeader><CardTitle>High-value prospects</CardTitle></CardHeader>
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <div className="px-5 py-6 text-center text-xs text-(--color-muted-foreground)">None yet.</div>
        ) : (
          <ul className="divide-y divide-(--color-border) text-sm">
            {rows.map((c) => (
              <li key={c.id} className="px-4 py-2">
                <Link href={`/companies/${c.id}`} className="block hover:text-(--color-accent)">
                  <div className="truncate font-medium">{c.companyName}</div>
                  <div className="text-[11px] text-(--color-muted-foreground)">
                    {c.googleReviewCount} reviews
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

async function ActivityLeaderboard() {
  const reps = await prisma.user.findMany({ where: { role: "SALES_REP", isActive: true } });
  const rows = await Promise.all(
    reps.map(async (r) => ({ rep: r, counts: await repActivityCounts(r.id, 7) }))
  );
  rows.sort((a, b) => totals(b.counts) - totals(a.counts));

  return (
    <Card className="h-full">
      <CardHeader><CardTitle>Activity leaderboard (7d)</CardTitle></CardHeader>
      <CardBody className="p-0">
        <ul className="divide-y divide-(--color-border) text-sm">
          {rows.map((r, idx) => (
            <li key={r.rep.id} className="flex items-center justify-between px-4 py-2">
              <span className="font-medium">#{idx + 1} {r.rep.firstName} {r.rep.lastName}</span>
              <span className="text-xs text-(--color-muted-foreground)">
                {r.counts.calls}c · {r.counts.texts}t · {r.counts.emails}e · {r.counts.meetings}m
              </span>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="px-4 py-4 text-center text-xs text-(--color-muted-foreground)">No reps yet.</li>
          ) : null}
        </ul>
      </CardBody>
    </Card>
  );
}

function CampaignPerformance() {
  return (
    <Card className="h-full">
      <CardHeader><CardTitle>Campaign performance</CardTitle></CardHeader>
      <CardBody className="p-6 text-center text-sm text-(--color-muted-foreground)">
        <Badge variant="accent">Phase 1C</Badge>
        <p className="mt-2">Campaign builder + SendGrid stats arrive in Phase 1C.</p>
      </CardBody>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Rep widgets
// ----------------------------------------------------------------------------

async function MyNextActions(ctx: Ctx) {
  const now = new Date();
  const weekOut = new Date(); weekOut.setDate(weekOut.getDate() + 7);
  const companies = await prisma.company.findMany({
    where: {
      assignedRepId: ctx.userId,
      deletedAt: null,
      nextActionDate: { lte: weekOut },
    },
    orderBy: [{ nextActionDate: "asc" }, { dealFlowTier: "asc" }],
    take: 12,
  });
  return (
    <Card className="h-full">
      <CardHeader><CardTitle>Next actions</CardTitle></CardHeader>
      <CardBody className="p-0">
        {companies.length === 0 ? (
          <div className="px-5 py-6 text-center text-xs text-(--color-muted-foreground)">
            Nothing scheduled.
          </div>
        ) : (
          <ul className="divide-y divide-(--color-border) text-sm">
            {companies.map((c) => {
              const overdue = c.nextActionDate && c.nextActionDate < now;
              return (
                <li key={c.id} className="px-4 py-2">
                  <Link href={`/companies/${c.id}`} className="block hover:text-(--color-accent)">
                    <div className="flex items-center justify-between">
                      <span className="truncate font-medium">{c.companyName}</span>
                      <Badge variant={c.dealFlowTier === "HIGH_VOLUME" ? "accent" : "muted"}>
                        {DEAL_FLOW_TIER_LABEL[c.dealFlowTier]}
                      </Badge>
                    </div>
                    <div className={"mt-0.5 text-[11px] " + (overdue ? "text-(--color-danger)" : "text-(--color-muted-foreground)")}>
                      {c.nextActionType ?? "Follow-up"} — {c.nextActionDate?.toLocaleDateString() ?? ""}
                      {overdue ? " (overdue)" : ""}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

async function MyQuickStats(ctx: Ctx) {
  const quarter = currentQuarterString();
  const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
  if (!user) return null;

  const targets = (user.outreachTargets as { daily_calls?: number; daily_emails?: number; daily_texts?: number }) ?? {};
  const [activity, quarterAgg] = await Promise.all([
    repActivityCounts(ctx.userId, 1),
    prisma.job.aggregate({
      where: { assignedRepId: ctx.userId, commissionQuarter: quarter, status: { not: "CANCELLED" } },
      _sum: { subcontractorEstimateTotal: true, repCommission: true },
    }),
  ]);
  const revenue = Number(quarterAgg._sum.subcontractorEstimateTotal ?? 0);
  const commission = Number(quarterAgg._sum.repCommission ?? 0);
  const { effectiveRate } = computeQuarterlyCommission(revenue, parseStructure(user.commissionStructure));

  return (
    <Card className="h-full">
      <CardHeader><CardTitle>Quick stats</CardTitle></CardHeader>
      <CardBody className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Calls today" value={`${activity.calls}/${targets.daily_calls ?? 0}`} hit={activity.calls >= (targets.daily_calls ?? 0)} />
        <Stat label="Texts today" value={`${activity.texts}/${targets.daily_texts ?? 0}`} hit={activity.texts >= (targets.daily_texts ?? 0)} />
        <Stat label="Emails today" value={`${activity.emails}/${targets.daily_emails ?? 0}`} hit={activity.emails >= (targets.daily_emails ?? 0)} />
        <Stat label="Meetings today" value={`${activity.meetings}`} />
        <Stat label={`${formatQuarter(quarter)} revenue`} value={`$${revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <Stat label="Commission tier" value={`${(effectiveRate * 100).toFixed(0)}%`} hit={effectiveRate > 0.1} />
        <Stat label="Commission so far" value={`$${commission.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} className="col-span-2" />
      </CardBody>
    </Card>
  );
}

function Stat({ label, value, hit, className }: { label: string; value: string; hit?: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wide text-(--color-muted-foreground)">{label}</div>
      <div className={"text-base font-medium " + (hit ? "text-(--color-success)" : "")}>{value}</div>
    </div>
  );
}

function daysSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function totals(c: { calls: number; texts: number; emails: number; meetings: number }) {
  return c.calls + c.texts + c.emails + c.meetings;
}
