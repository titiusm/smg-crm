// Printable estimate page. Styled for print — browser's "Save as PDF" produces the output.
// Phase 1C can swap this for server-side PDF rendering (react-pdf or Puppeteer).
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isScopedToOwnCompanies } from "@/lib/rbac";
import { format } from "date-fns";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;

  const estimate = await prisma.estimate.findUnique({
    where: { id },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      job: { include: { company: true, contact: true } },
    },
  });
  if (!estimate) return new NextResponse("Not found", { status: 404 });
  if (
    isScopedToOwnCompanies(session.user.role) &&
    estimate.job.company.assignedRepId !== session.user.id
  ) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const settings = await prisma.globalSetting.findMany();
  const get = (k: string): string => {
    const v = settings.find((s) => s.key === k)?.value;
    return typeof v === "string" ? v : "";
  };
  const fromName = get("default_email_from_name") || "The Solar Maintenance Guys";
  const license = get("license_number");
  const addr = get("company_physical_address");
  const logo = get("company_logo_path");
  const terms = get("estimate_terms_text");

  const title = `${estimate.estimateType === "INSURANCE_RETAIL" ? "Insurance Retail" : "Subcontractor"} Estimate — ${estimate.job.company.companyName}`;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif; color: #111; background: #fff; margin: 0; padding: 40px; }
    .wrap { max-width: 760px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
    .brand { font-size: 20px; font-weight: 700; color: #0f766e; }
    .muted { color: #555; font-size: 12px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e5e5; font-size: 13px; }
    th { background: #fafafa; text-transform: uppercase; font-size: 11px; letter-spacing: 0.06em; color: #555; }
    .right { text-align: right; }
    .total-row td { font-weight: 700; border-top: 2px solid #111; border-bottom: 0; padding-top: 12px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .panel { border: 1px solid #e5e5e5; border-radius: 10px; padding: 14px; }
    .panel h3 { margin: 0 0 6px; font-size: 13px; text-transform: uppercase; color: #555; letter-spacing: 0.06em; }
    .terms { margin-top: 32px; padding-top: 16px; border-top: 1px dashed #ccc; font-size: 11px; color: #555; white-space: pre-wrap; }
    @media print { body { padding: 20px; } button { display: none; } }
    .print-btn { display: inline-block; margin: 0 0 14px; padding: 8px 12px; background: #0f766e; color: #fff; border-radius: 8px; border: 0; cursor: pointer; font-weight: 600; }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Save as PDF</button>
  <div class="wrap">
    <header>
      <div>
        ${logo ? `<img src="${escapeHtml(logo)}" alt="Logo" style="max-height:56px;margin-bottom:6px;"/>` : ""}
        <div class="brand">${escapeHtml(fromName)}</div>
        ${license ? `<div class="muted">License #${escapeHtml(license)}</div>` : ""}
        ${addr ? `<div class="muted">${escapeHtml(addr)}</div>` : ""}
      </div>
      <div style="text-align:right">
        <h1>${estimate.estimateType === "INSURANCE_RETAIL" ? "Insurance Retail Estimate" : "Subcontractor Estimate"}</h1>
        <div class="muted">v${estimate.versionNumber} · ${format(estimate.createdAt, "MMM d, yyyy")}</div>
      </div>
    </header>

    <div class="grid-2">
      <div class="panel">
        <h3>Bill to</h3>
        <div><strong>${escapeHtml(estimate.job.company.companyName)}</strong></div>
        ${estimate.job.contact ? `<div>${escapeHtml(estimate.job.contact.firstName + " " + (estimate.job.contact.lastName ?? ""))}</div>` : ""}
        ${estimate.job.company.addressStreet ? `<div class="muted">${escapeHtml(estimate.job.company.addressStreet)}</div>` : ""}
        <div class="muted">${[estimate.job.company.addressCity, estimate.job.company.addressState, estimate.job.company.addressZip].filter((x): x is string => !!x).map(escapeHtml).join(", ")}</div>
      </div>
      <div class="panel">
        <h3>Job location</h3>
        ${estimate.job.jobAddressStreet ? `<div>${escapeHtml(estimate.job.jobAddressStreet)}</div>` : ""}
        <div class="muted">${[estimate.job.jobAddressCity, estimate.job.jobAddressState, estimate.job.jobAddressZip].filter((x): x is string => !!x).map(escapeHtml).join(", ")}</div>
        ${estimate.job.panelCount ? `<div class="muted" style="margin-top:4px;">${estimate.job.panelCount} panels</div>` : ""}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:55%">Item</th>
          <th class="right">Qty</th>
          <th class="right">Unit</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${estimate.lineItems
          .map(
            (li) => `<tr>
              <td>
                <div>${escapeHtml(li.itemName)}</div>
                ${li.description ? `<div class="muted">${escapeHtml(li.description)}</div>` : ""}
              </td>
              <td class="right">${Number(li.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              <td class="right">$${Number(li.unitPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              <td class="right">$${Number(li.total).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            </tr>`
          )
          .join("")}
        <tr class="total-row">
          <td colspan="3" class="right">Total</td>
          <td class="right">$${Number(estimate.totalAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
        </tr>
      </tbody>
    </table>

    ${terms ? `<div class="terms">${escapeHtml(terms)}</div>` : ""}
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
