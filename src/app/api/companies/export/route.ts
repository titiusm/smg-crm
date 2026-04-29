// CSV export of the company list. Respects role-scoping (reps only export their own).
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { scopedCompanyWhere, buildSearchFilter } from "@/lib/companies";
import { formatPhoneForDisplay } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids");
  const scope = { userId: session.user.id, role: session.user.role };

  let where: Prisma.CompanyWhereInput;
  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    where = { ...scopedCompanyWhere(scope), id: { in: ids } };
  } else {
    where = scopedCompanyWhere(scope);
    const search = buildSearchFilter(url.searchParams.get("q"));
    const AND: Prisma.CompanyWhereInput[] = [];
    if (search) AND.push(search);
    const status = url.searchParams.get("status");
    if (status) AND.push({ status: status as Prisma.CompanyWhereInput["status"] });
    const tier = url.searchParams.get("tier");
    if (tier) AND.push({ dealFlowTier: tier as Prisma.CompanyWhereInput["dealFlowTier"] });
    if (AND.length) where.AND = AND;
  }

  const companies = await prisma.company.findMany({
    where,
    include: { assignedRep: true },
    orderBy: { companyName: "asc" },
    take: 10_000,
  });

  const rows = [
    [
      "Company",
      "Status",
      "Tier",
      "Phone",
      "Email",
      "Website",
      "Street",
      "City",
      "State",
      "Zip",
      "Google Rating",
      "Google Reviews",
      "Assigned Rep",
      "Do Not Call",
      "Do Not Email",
      "Do Not Text",
      "Last Contacted",
      "Last Project",
      "Source",
    ],
    ...companies.map((c) => [
      c.companyName,
      c.status,
      c.dealFlowTier,
      formatPhoneForDisplay(c.phoneNumber ?? ""),
      c.email ?? "",
      c.website ?? "",
      c.addressStreet ?? "",
      c.addressCity ?? "",
      c.addressState ?? "",
      c.addressZip ?? "",
      c.googleRating?.toString() ?? "",
      c.googleReviewCount?.toString() ?? "",
      c.assignedRep ? `${c.assignedRep.firstName} ${c.assignedRep.lastName}` : "",
      c.doNotCall ? "Yes" : "No",
      c.doNotEmail ? "Yes" : "No",
      c.doNotText ? "Yes" : "No",
      c.dateLastContacted?.toISOString() ?? "",
      c.dateLastProject?.toISOString() ?? "",
      c.source,
    ]),
  ];

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const filename = `companies-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
