import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { JOB_STATUS_LABEL, JOB_STATUS_ORDER } from "@/lib/jobs";
import { scopedCompanyWhere } from "@/lib/companies";
import { LayoutGrid, List } from "lucide-react";
import type { Prisma } from "@prisma/client";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string }>;
}) {
  const session = await auth();
  if (!session) return null;
  const scope = { userId: session.user.id, role: session.user.role };
  const params = await searchParams;
  const view = params.view === "pipeline" ? "pipeline" : "list";

  const where: Prisma.JobWhereInput = {
    deletedAt: null,
    company: scopedCompanyWhere(scope),
  };
  if (params.status) where.status = params.status as Prisma.JobWhereInput["status"];

  if (view === "pipeline") {
    const jobs = await prisma.job.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { company: true },
      take: 400,
    });
    const grouped = new Map<string, typeof jobs>();
    for (const s of JOB_STATUS_ORDER) grouped.set(s, []);
    grouped.set("CANCELLED", []);

    for (const j of jobs) grouped.get(j.status)!.push(j);

    return (
      <div className="space-y-4">
        <Header view={view} params={params} />
        <div className="grid grid-flow-col auto-cols-[minmax(240px,1fr)] gap-3 overflow-x-auto pb-2">
          {[...JOB_STATUS_ORDER, "CANCELLED" as const].map((status) => {
            const items = grouped.get(status) ?? [];
            const subTotal = items.reduce((acc, j) => acc + Number(j.subcontractorEstimateTotal ?? 0), 0);
            return (
              <Card key={status} className="flex min-h-[200px] flex-col">
                <div className="border-b border-(--color-border) px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-(--color-muted-foreground)">
                      {JOB_STATUS_LABEL[status]}
                    </span>
                    <Badge variant="muted">{items.length}</Badge>
                  </div>
                  <div className="mt-1 text-[11px] text-(--color-muted-foreground)">
                    ${subTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div className="flex-1 space-y-2 p-2">
                  {items.slice(0, 50).map((j) => (
                    <Link key={j.id} href={`/jobs/${j.id}`} className="block">
                      <div className="rounded-[10px] border border-(--color-border) bg-(--color-background) p-2.5 hover:border-(--color-accent)/50">
                        <div className="text-sm font-medium truncate">{j.company.companyName}</div>
                        <div className="mt-0.5 text-[11px] text-(--color-muted-foreground)">
                          {j.panelCount ?? "?"} panels
                          {j.pricePerPanel ? ` · $${Number(j.pricePerPanel).toFixed(0)}/pnl` : ""}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  const jobs = await prisma.job.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { company: true, assignedRep: true },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <Header view={view} params={params} />
      <Card>
        {jobs.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-(--color-muted-foreground)">
            No jobs yet. Create one from a company profile.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-(--color-border) bg-(--color-muted)/40">
                <tr className="text-left text-xs uppercase tracking-wide text-(--color-muted-foreground)">
                  <th className="px-4 py-2">Company</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Panels</th>
                  <th className="px-4 py-2">Sub Total</th>
                  <th className="px-4 py-2">Rep</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-(--color-muted)/40">
                    <td className="px-4 py-2">
                      <Link href={`/jobs/${j.id}`} className="font-medium hover:text-(--color-accent)">
                        {j.company.companyName}
                      </Link>
                      <div className="text-[11px] text-(--color-muted-foreground)">
                        {[j.jobAddressCity, j.jobAddressState].filter(Boolean).join(", ") || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={j.approvalStatus === "PENDING" ? "warning" : "muted"}>
                        {JOB_STATUS_LABEL[j.status]}
                        {j.approvalStatus === "PENDING" ? " · Approval" : ""}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs">{j.panelCount ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">
                      {j.subcontractorEstimateTotal
                        ? `$${Number(j.subcontractorEstimateTotal).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {j.assignedRep ? `${j.assignedRep.firstName} ${j.assignedRep.lastName}` : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/jobs/${j.id}`}><Button variant="outline" size="sm">Open</Button></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Header({ view, params }: { view: string; params: Record<string, string | undefined> }) {
  const build = (patch: Record<string, string | undefined>) => {
    const merged = { ...params, ...patch };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
    return `/jobs?${qs.toString()}`;
  };
  return (
    <div className="flex items-end justify-between gap-2">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
        <p className="text-sm text-(--color-muted-foreground)">
          Everything in flight — from sent estimate through paid invoice.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link href={build({ view: "list" })}>
          <Button variant={view === "list" ? "primary" : "outline"} size="sm">
            <List className="h-4 w-4" /> List
          </Button>
        </Link>
        <Link href={build({ view: "pipeline" })}>
          <Button variant={view === "pipeline" ? "primary" : "outline"} size="sm">
            <LayoutGrid className="h-4 w-4" /> Pipeline
          </Button>
        </Link>
        <Link href="/api/jobs/export" target="_blank">
          <Button variant="outline" size="sm">Export CSV</Button>
        </Link>
      </div>
    </div>
  );
}
