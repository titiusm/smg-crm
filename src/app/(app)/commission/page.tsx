import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Badge, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import {
  computeQuarterlyCommission,
  currentQuarterString,
  describeStructure,
  formatQuarter,
  parseStructure,
} from "@/lib/commission";

export default async function CommissionPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; userId?: string }>;
}) {
  const session = await auth();
  if (!session) return null;
  const { q, userId: userIdParam } = await searchParams;
  const quarter = q || currentQuarterString();

  // Which user's commission are we viewing?
  // Reps can only see their own. Owner/Admin can pick any rep.
  const viewingUserId =
    session.user.role === "OWNER" && userIdParam ? userIdParam : session.user.id;

  const user = await prisma.user.findUnique({ where: { id: viewingUserId } });
  if (!user) return null;

  const [jobsThisQuarter, reps] = await Promise.all([
    prisma.job.findMany({
      where: { assignedRepId: viewingUserId, commissionQuarter: quarter, status: { not: "CANCELLED" } },
      include: { company: true },
      orderBy: { datePaid: "desc" },
    }),
    session.user.role === "OWNER"
      ? prisma.user.findMany({ where: { role: "SALES_REP", isActive: true }, orderBy: { firstName: "asc" } })
      : Promise.resolve([]),
  ]);

  const revenue = jobsThisQuarter.reduce(
    (acc, j) => acc + Number(j.subcontractorEstimateTotal ?? 0),
    0
  );
  const profit = jobsThisQuarter.reduce(
    (acc, j) => acc + Number(j.profitSnapshot ?? 0),
    0
  );
  const sumPerJobCommissions = jobsThisQuarter.reduce(
    (acc, j) => acc + Number(j.repCommission ?? 0),
    0
  );
  const structure = parseStructure(user.commissionStructure);
  const { baseCommission, bonus, totalCommission, effectiveRate } =
    computeQuarterlyCommission(revenue, structure);

  const quarters = generateRecentQuarters(6);

  // Per-structure derived stats for the header strip:
  const flatRate =
    structure.type === "flat_revenue" || structure.type === "flat_profit"
      ? structure.rate
      : null;
  const jobsMissingProfitSnapshot =
    structure.type === "flat_profit"
      ? jobsThisQuarter.filter((j) => j.profitSnapshot == null).length
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Commission summary</h1>
          <p className="text-sm text-(--color-muted-foreground)">
            {session.user.role === "OWNER"
              ? "Quarterly revenue and commission by rep."
              : "Your quarterly revenue and commission."}
          </p>
        </div>
        <form action="/commission" method="get" className="flex items-end gap-2">
          <div>
            <Select name="q" defaultValue={quarter}>
              {quarters.map((q) => (
                <option key={q} value={q}>{formatQuarter(q)}</option>
              ))}
            </Select>
          </div>
          {session.user.role === "OWNER" ? (
            <div>
              <Select name="userId" defaultValue={viewingUserId}>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>{r.firstName} {r.lastName}</option>
                ))}
              </Select>
            </div>
          ) : null}
          <Button type="submit" size="sm" variant="outline">View</Button>
        </form>
      </div>

      <Card>
        <CardBody className="text-sm flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-(--color-muted-foreground)">Structure</div>
            <div className="font-medium">{describeStructure(structure)}</div>
          </div>
        </CardBody>
      </Card>

      {structure.type === "quarterly_revenue_tiers" ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Stat label={`${formatQuarter(quarter)} revenue`} value={`$${revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          <Stat label="Effective tier rate" value={`${(effectiveRate * 100).toFixed(0)}%`} accent="accent" />
          <Stat label={`Base (${(structure.base_rate * 100).toFixed(0)}%)`} value={`$${baseCommission.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          <Stat
            label="Bonus adjustment"
            value={`${bonus >= 0 ? "+" : "-"}$${Math.abs(bonus).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            accent={bonus > 0 ? "accent" : "muted"}
          />
          <Stat
            label="Total commission"
            value={`$${totalCommission.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            accent="accent"
            className="md:col-span-4"
          />
        </div>
      ) : structure.type === "flat_revenue" ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Stat label={`${formatQuarter(quarter)} revenue`} value={`$${revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          <Stat label="Rate" value={`${((flatRate ?? 0) * 100).toFixed(1)}%`} accent="accent" />
          <Stat
            label="Total commission"
            value={`$${(revenue * (flatRate ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            accent="accent"
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          <Stat label={`${formatQuarter(quarter)} revenue`} value={`$${revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          <Stat label="Profit (frozen snapshots)" value={`$${profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          <Stat label="Rate" value={`${((flatRate ?? 0) * 100).toFixed(1)}%`} accent="accent" />
          <Stat
            label="Total commission"
            value={`$${sumPerJobCommissions.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            accent="accent"
          />
          {jobsMissingProfitSnapshot > 0 ? (
            <Stat
              label="Pending cost entry"
              value={`${jobsMissingProfitSnapshot} job${jobsMissingProfitSnapshot === 1 ? "" : "s"}`}
              accent="muted"
              className="md:col-span-4"
            />
          ) : null}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Jobs counted this quarter</CardTitle></CardHeader>
        <CardBody className="p-0">
          {jobsThisQuarter.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-(--color-muted-foreground)">
              No jobs have been marked Paid in this quarter yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-(--color-border) bg-(--color-muted)/40">
                <tr className="text-left text-xs uppercase tracking-wide text-(--color-muted-foreground)">
                  <th className="px-4 py-2">Company</th>
                  <th className="px-4 py-2">Sub total</th>
                  <th className="px-4 py-2">Commission est.</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {jobsThisQuarter.map((j) => (
                  <tr key={j.id}>
                    <td className="px-4 py-2">
                      <Link href={`/jobs/${j.id}`} className="font-medium hover:text-(--color-accent)">
                        {j.company.companyName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      ${Number(j.subcontractorEstimateTotal ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      ${Number(j.repCommission ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={
                          j.commissionStatus === "PAID"
                            ? "success"
                            : j.commissionStatus === "ELIGIBLE"
                            ? "accent"
                            : j.commissionStatus === "CANCELLED"
                            ? "danger"
                            : "muted"
                        }
                      >
                        {j.commissionStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/jobs/${j.id}`}>
                        <Button variant="outline" size="sm">Open</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = "muted",
  className,
}: {
  label: string;
  value: string;
  accent?: "muted" | "accent";
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardBody>
        <div className="text-xs uppercase tracking-wide text-(--color-muted-foreground)">{label}</div>
        <div className={"mt-1 text-2xl font-semibold " + (accent === "accent" ? "text-(--color-accent)" : "")}>{value}</div>
      </CardBody>
    </Card>
  );
}

function generateRecentQuarters(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  let y = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < n; i++) {
    out.push(`${y}-Q${q}`);
    q -= 1;
    if (q < 1) { q = 4; y -= 1; }
  }
  return out;
}
