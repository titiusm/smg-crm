import { requireRole } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { funnelMetrics, repActivityCounts } from "@/lib/scanners";
import { computeQuarterlyCommission, currentQuarterString, formatQuarter, parseStructure } from "@/lib/commission";

export default async function ReportsPage() {
  await requireRole(["OWNER", "LIMITED_ADMIN", "REGIONAL_MANAGER"]);

  const funnel = await funnelMetrics();

  const reps = await prisma.user.findMany({
    where: { role: "SALES_REP", isActive: true },
    orderBy: { firstName: "asc" },
  });
  const quarter = currentQuarterString();
  const rows = await Promise.all(
    reps.map(async (r) => {
      const [agg, activity] = await Promise.all([
        prisma.job.aggregate({
          where: { assignedRepId: r.id, commissionQuarter: quarter, status: { not: "CANCELLED" } },
          _sum: { subcontractorEstimateTotal: true, repCommission: true },
          _count: { _all: true },
        }),
        repActivityCounts(r.id, 30),
      ]);
      const revenue = Number(agg._sum.subcontractorEstimateTotal ?? 0);
      const commission = Number(agg._sum.repCommission ?? 0);
      const structure = parseStructure(r.commissionStructure);
      const { effectiveRate, totalCommission } = computeQuarterlyCommission(revenue, structure);
      return {
        rep: r,
        revenue,
        commission,
        projected: totalCommission,
        effectiveRate,
        jobs: agg._count._all,
        activity,
      };
    })
  );

  const contactedToAgreed = funnel.totalContacted > 0
    ? (funnel.totalAgreed / funnel.totalContacted) * 100
    : 0;
  const agreedToFirstJob = funnel.totalAgreed > 0
    ? (funnel.totalFirstJob / funnel.totalAgreed) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-(--color-muted-foreground)">
          Funnel, conversion rates, and per-rep activity for the last 30 days + quarterly tier progress.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Funnel</CardTitle></CardHeader>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-5">
            <FunnelStep label="Contacted" value={funnel.totalContacted} />
            <FunnelStep label="Interested" value={funnel.totalInterested} />
            <FunnelStep label="Agreed to Use Us" value={funnel.totalAgreed} accent />
            <FunnelStep label="First Job Sent" value={funnel.totalFirstJob} />
            <FunnelStep label="Repeat Customer" value={funnel.totalRepeat} accent />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
            <div className="rounded-[10px] border border-(--color-border) p-3">
              <div className="text-xs uppercase text-(--color-muted-foreground)">Contacted → Agreed</div>
              <div className="text-2xl font-semibold">{contactedToAgreed.toFixed(1)}%</div>
            </div>
            <div className="rounded-[10px] border border-(--color-border) p-3">
              <div className="text-xs uppercase text-(--color-muted-foreground)">Agreed → First Job</div>
              <div className="text-2xl font-semibold">{agreedToFirstJob.toFixed(1)}%</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Per-rep performance — {formatQuarter(quarter)}</CardTitle></CardHeader>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-(--color-border) text-xs uppercase tracking-wide text-(--color-muted-foreground)">
              <tr>
                <th className="px-4 py-2 text-left">Rep</th>
                <th className="px-4 py-2 text-right">Quarterly revenue</th>
                <th className="px-4 py-2 text-right">Tier</th>
                <th className="px-4 py-2 text-right">Projected commission</th>
                <th className="px-4 py-2 text-right">Jobs</th>
                <th className="px-4 py-2 text-right">Activity (30d)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {rows.map((r) => (
                <tr key={r.rep.id}>
                  <td className="px-4 py-2 font-medium">{r.rep.firstName} {r.rep.lastName}</td>
                  <td className="px-4 py-2 text-right">${r.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-2 text-right">
                    <Badge variant="accent">{(r.effectiveRate * 100).toFixed(0)}%</Badge>
                  </td>
                  <td className="px-4 py-2 text-right">${r.projected.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-2 text-right">{r.jobs}</td>
                  <td className="px-4 py-2 text-right text-xs text-(--color-muted-foreground)">
                    {r.activity.calls}c · {r.activity.texts}t · {r.activity.emails}e · {r.activity.meetings}m
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-(--color-muted-foreground)">No reps yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}

function FunnelStep({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={"rounded-[10px] border p-3 " + (accent ? "border-(--color-accent)/40 bg-(--color-accent)/5" : "border-(--color-border)")}>
      <div className="text-xs uppercase tracking-wide text-(--color-muted-foreground)">{label}</div>
      <div className={"mt-1 text-2xl font-semibold " + (accent ? "text-(--color-accent)" : "")}>{value.toLocaleString()}</div>
    </div>
  );
}
