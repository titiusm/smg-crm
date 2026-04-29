import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  Badge,
  Input,
  Select,
} from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import {
  buildSearchFilter,
  scopedCompanyWhere,
  COMPANY_STATUS_LABEL,
  COMPANY_STATUS_ORDER,
  DEAL_FLOW_TIER_LABEL,
} from "@/lib/companies";
import { Ban, LayoutGrid, List, Plus, Map as MapIcon } from "lucide-react";
import { BulkCompaniesTable } from "./_table";
import { CompaniesMapWrapper } from "./_map-wrapper";
import type { Prisma } from "@prisma/client";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    tier?: string;
    view?: string;
    rep?: string;
    dnc?: string;
    page?: string;
  }>;
}) {
  const session = await auth();
  if (!session) return null;
  const scope = { userId: session.user.id, role: session.user.role };
  const params = await searchParams;

  const where: Prisma.CompanyWhereInput = scopedCompanyWhere(scope);
  const s = buildSearchFilter(params.q);
  const AND: Prisma.CompanyWhereInput[] = [];
  if (s) AND.push(s);
  if (params.status) AND.push({ status: params.status as Prisma.CompanyWhereInput["status"] });
  if (params.tier) AND.push({ dealFlowTier: params.tier as Prisma.CompanyWhereInput["dealFlowTier"] });
  if (params.rep) AND.push({ assignedRepId: params.rep });
  if (params.dnc === "1") AND.push({ OR: [{ doNotCall: true }, { doNotEmail: true }, { doNotText: true }] });
  if (AND.length) where.AND = AND;

  const view = params.view === "pipeline" ? "pipeline" : params.view === "map" ? "map" : "list";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 50;

  const reps = session.user.role !== "SALES_REP"
    ? await prisma.user.findMany({
        where: { role: "SALES_REP", isActive: true },
        orderBy: { firstName: "asc" },
      })
    : [];

  if (view === "map") {
    const mapCompanies = await prisma.company.findMany({
      where: { ...where, latitude: { not: null }, longitude: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 2500,
      select: {
        id: true, companyName: true, latitude: true, longitude: true,
        status: true, addressCity: true, addressState: true,
        doNotCall: true, doNotEmail: true, doNotText: true,
      },
    });
    const mapRows = mapCompanies
      .filter((c): c is typeof c & { latitude: number; longitude: number } => c.latitude != null && c.longitude != null)
      .map((c) => ({
        id: c.id,
        companyName: c.companyName,
        latitude: c.latitude,
        longitude: c.longitude,
        status: c.status,
        statusLabel: COMPANY_STATUS_LABEL[c.status] ?? c.status,
        addressCity: c.addressCity,
        addressState: c.addressState,
        dnc: c.doNotCall || c.doNotEmail || c.doNotText,
      }));

    return (
      <div className="space-y-4">
        <Header session={session} view={view} reps={reps} params={params} />
        <div className="text-xs text-(--color-muted-foreground)">
          {mapRows.length.toLocaleString()} company {mapRows.length === 1 ? "pin" : "pins"} ·
          companies without lat/lng don&apos;t appear (populate from the CSV import).
        </div>
        <CompaniesMapWrapper companies={mapRows} />
      </div>
    );
  }

  if (view === "pipeline") {
    const companies = await prisma.company.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: 600,
      include: { assignedRep: true },
    });
    const grouped = new Map<string, typeof companies>();
    for (const s of COMPANY_STATUS_ORDER) grouped.set(s, []);
    for (const c of companies) grouped.get(c.status)!.push(c);

    return (
      <div className="space-y-4">
        <Header session={session} view={view} reps={reps} params={params} />
        <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-3 overflow-x-auto pb-2">
          {COMPANY_STATUS_ORDER.map((status) => {
            const items = grouped.get(status)!;
            return (
              <Card key={status} className="flex min-h-[200px] flex-col">
                <div className="border-b border-(--color-border) px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-(--color-muted-foreground)">
                    {COMPANY_STATUS_LABEL[status]}
                  </span>
                  <Badge variant="muted">{items.length}</Badge>
                </div>
                <div className="flex-1 space-y-2 p-2">
                  {items.slice(0, 100).map((c) => (
                    <Link key={c.id} href={`/companies/${c.id}`} className="block">
                      <div className="rounded-[10px] border border-(--color-border) bg-(--color-background) p-2.5 hover:border-(--color-accent)/50 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-medium truncate">{c.companyName}</div>
                          <div className="flex gap-1">
                            {c.doNotCall || c.doNotEmail || c.doNotText ? (
                              <Ban className="h-3 w-3 text-(--color-danger)" />
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] text-(--color-muted-foreground) truncate">
                          {[c.addressCity, c.addressState].filter(Boolean).join(", ") || "—"}
                        </div>
                      </div>
                    </Link>
                  ))}
                  {items.length === 0 ? (
                    <div className="px-2 py-4 text-center text-xs text-(--color-muted-foreground)">
                      Empty
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  const [total, companies] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { assignedRep: true },
    }),
  ]);

  return (
    <div className="space-y-4">
      <Header session={session} view={view} reps={reps} params={params} />
      <Card>
        <BulkCompaniesTable
          rows={companies.map((c) => ({
            id: c.id,
            companyName: c.companyName,
            status: c.status,
            dealFlowTier: c.dealFlowTier,
            addressCity: c.addressCity,
            addressState: c.addressState,
            phoneNumber: c.phoneNumber,
            email: c.email,
            googleReviewCount: c.googleReviewCount,
            googleRating: c.googleRating,
            doNotCall: c.doNotCall,
            doNotEmail: c.doNotEmail,
            doNotText: c.doNotText,
            assignedRepLabel: c.assignedRep ? `${c.assignedRep.firstName} ${c.assignedRep.lastName}` : null,
          }))}
          canBulkEdit={session.user.role === "OWNER" || session.user.role === "LIMITED_ADMIN"}
          statusLabels={COMPANY_STATUS_LABEL}
          tierLabels={DEAL_FLOW_TIER_LABEL}
          reps={reps.map((r) => ({ id: r.id, label: `${r.firstName} ${r.lastName}` }))}
        />
        <div className="flex items-center justify-between border-t border-(--color-border) px-4 py-2 text-xs text-(--color-muted-foreground)">
          <div>
            Showing {companies.length === 0 ? 0 : (page - 1) * pageSize + 1}–
            {(page - 1) * pageSize + companies.length} of {total.toLocaleString()}
          </div>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={buildUrl(params, { page: String(page - 1) })}>
                <Button variant="outline" size="sm">Prev</Button>
              </Link>
            ) : null}
            {page * pageSize < total ? (
              <Link href={buildUrl(params, { page: String(page + 1) })}>
                <Button variant="outline" size="sm">Next</Button>
              </Link>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Header({
  session,
  view,
  reps,
  params,
}: {
  session: { user: { role: string } };
  view: string;
  reps: Array<{ id: string; firstName: string; lastName: string }>;
  params: Record<string, string | undefined>;
}) {
  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm text-(--color-muted-foreground)">
            {session.user.role === "SALES_REP"
              ? "Your assigned roofing companies."
              : "All roofing company records."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={buildUrl(params, { view: "list" })}>
            <Button variant={view === "list" ? "primary" : "outline"} size="sm">
              <List className="h-4 w-4" /> List
            </Button>
          </Link>
          <Link href={buildUrl(params, { view: "pipeline" })}>
            <Button variant={view === "pipeline" ? "primary" : "outline"} size="sm">
              <LayoutGrid className="h-4 w-4" /> Pipeline
            </Button>
          </Link>
          <Link href={buildUrl(params, { view: "map" })}>
            <Button variant={view === "map" ? "primary" : "outline"} size="sm">
              <MapIcon className="h-4 w-4" /> Map
            </Button>
          </Link>
          <Link href={`/api/companies/export${searchString(params)}`} target="_blank">
            <Button variant="outline" size="sm">Export CSV</Button>
          </Link>
          <Link href="/companies/new">
            <Button size="sm">
              <Plus className="h-4 w-4" /> New company
            </Button>
          </Link>
        </div>
      </div>

      <form action="/companies" method="get" className="grid gap-2 md:grid-cols-5">
        {view ? <input type="hidden" name="view" value={view} /> : null}
        <Input name="q" placeholder="Search name, email, phone, city…" defaultValue={params.q ?? ""} />
        <Select name="status" defaultValue={params.status ?? ""}>
          <option value="">All statuses</option>
          {COMPANY_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {COMPANY_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select name="tier" defaultValue={params.tier ?? ""}>
          <option value="">All tiers</option>
          {Object.entries(DEAL_FLOW_TIER_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        {reps.length > 0 ? (
          <Select name="rep" defaultValue={params.rep ?? ""}>
            <option value="">All reps</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.firstName} {r.lastName}
              </option>
            ))}
          </Select>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" name="dnc" value="1" defaultChecked={params.dnc === "1"} />
            Only DNC
          </label>
          <Button type="submit" variant="outline" size="sm">Apply</Button>
        </div>
      </form>
    </>
  );
}

function buildUrl(current: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const merged = { ...current, ...patch };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) qs.set(k, v);
  }
  return `/companies?${qs.toString()}`;
}

function searchString(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const k of ["q", "status", "tier", "rep", "dnc"] as const) {
    if (params[k]) qs.set(k, params[k]!);
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}
