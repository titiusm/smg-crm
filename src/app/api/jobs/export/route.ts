// CSV export of jobs. Owner/admin see cost + profit; reps do not.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canSeeCosts } from "@/lib/rbac";
import { scopedCompanyWhere } from "@/lib/companies";
import { JOB_STATUS_LABEL } from "@/lib/jobs";
import type { Prisma } from "@prisma/client";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

  const scope = { userId: session.user.id, role: session.user.role };
  const where: Prisma.JobWhereInput = {
    deletedAt: null,
    company: scopedCompanyWhere(scope),
  };

  const jobs = await prisma.job.findMany({
    where,
    include: { company: true, assignedRep: true },
    orderBy: { updatedAt: "desc" },
    take: 10_000,
  });

  const seeCosts = canSeeCosts(session.user.role, session.user.permissions);

  const headers = [
    "Company",
    "Status",
    "Panels",
    "Price/Panel",
    "Insurance Total",
    "Subcontractor Total",
    "Commission Estimate",
    "Commission Status",
    "Quarter",
    "Rep",
    "Approval Status",
    "Estimate Sent",
    "Approved",
    "Detach Complete",
    "Reinstall Complete",
    "Invoiced",
    "Paid",
  ];
  if (seeCosts) headers.push("Actual Cost", "Profit Snapshot");

  const rows: unknown[][] = [headers];
  for (const j of jobs) {
    const row: unknown[] = [
      j.company.companyName,
      JOB_STATUS_LABEL[j.status],
      j.panelCount ?? "",
      j.pricePerPanel?.toString() ?? "",
      j.insuranceEstimateTotal?.toString() ?? "",
      j.subcontractorEstimateTotal?.toString() ?? "",
      j.repCommission?.toString() ?? "",
      j.commissionStatus,
      j.commissionQuarter ?? "",
      j.assignedRep ? `${j.assignedRep.firstName} ${j.assignedRep.lastName}` : "",
      j.approvalStatus,
      j.dateEstimateSent?.toISOString() ?? "",
      j.dateApproved?.toISOString() ?? "",
      j.dateDetachCompleted?.toISOString() ?? "",
      j.dateReinstallCompleted?.toISOString() ?? "",
      j.dateInvoiced?.toISOString() ?? "",
      j.datePaid?.toISOString() ?? "",
    ];
    if (seeCosts) row.push(j.actualCost?.toString() ?? "", j.profitSnapshot?.toString() ?? "");
    rows.push(row);
  }

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jobs-${new Date().toISOString().slice(0, 10)}.csv"`,
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

