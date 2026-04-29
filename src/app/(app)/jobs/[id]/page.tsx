import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Badge, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { JOB_STATUS_LABEL, JOB_STATUS_ORDER } from "@/lib/jobs";
import { canSeeCosts, isScopedToOwnCompanies } from "@/lib/rbac";
import {
  approvalDecision,
  cancelJob,
  enterCosts,
  markCommissionPaid,
  overrideCommissionQuarter,
  transitionJobStatus,
} from "../actions";
import { createEstimate } from "./estimates/actions";
import { formatDistanceToNow, format } from "date-fns";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return null;
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      company: true,
      contact: true,
      assignedRep: true,
      deal: true,
      estimates: { orderBy: [{ estimateType: "asc" }, { versionNumber: "desc" }] },
    },
  });
  if (!job || job.deletedAt) notFound();
  if (isScopedToOwnCompanies(session.user.role) && job.company.assignedRepId !== session.user.id) {
    redirect("/jobs");
  }

  const seeCosts = canSeeCosts(session.user.role, session.user.permissions);

  // Pick current versions of each estimate type
  const insurance = job.estimates.find((e) => e.estimateType === "INSURANCE_RETAIL" && e.isCurrentVersion);
  const subcontractor = job.estimates.find((e) => e.estimateType === "SUBCONTRACTOR" && e.isCurrentVersion);

  const history = Array.isArray(job.statusHistory) ? (job.statusHistory as Array<{ status: string; changed_at: string; backward?: boolean }>) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href={`/companies/${job.companyId}`} className="text-xs text-(--color-muted-foreground) hover:text-(--color-foreground)">
            ← {job.company.companyName}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Job — {job.company.companyName}
            </h1>
            <Badge variant={job.approvalStatus === "PENDING" ? "warning" : "accent"}>
              {JOB_STATUS_LABEL[job.status]}
            </Badge>
            {job.approvalStatus === "PENDING" ? (
              <Badge variant="warning">Pending approval</Badge>
            ) : null}
            {job.approvalStatus === "DENIED" ? (
              <Badge variant="danger">Denied</Badge>
            ) : null}
          </div>
          <div className="text-xs text-(--color-muted-foreground)">
            {job.panelCount ?? "?"} panels
            {job.pricePerPanel ? ` · $${Number(job.pricePerPanel).toFixed(2)}/panel` : ""}
            {job.jobAddressCity ? ` · ${job.jobAddressCity}, ${job.jobAddressState ?? ""}` : ""}
          </div>
        </div>
      </div>

      {/* Approval panel (owner only, when pending) */}
      {job.approvalStatus === "PENDING" && session.user.role === "OWNER" ? (
        <Card>
          <CardHeader><CardTitle>Pricing approval required</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm">
              This job is priced at <strong>${Number(job.pricePerPanel ?? 0).toFixed(2)}/panel</strong>, below the $150 minimum.
              Decision will be recorded in the audit log.
            </p>
            <div className="flex gap-2">
              <form action={approvalDecision}>
                <input type="hidden" name="id" value={job.id} />
                <input type="hidden" name="decision" value="APPROVED" />
                <Button type="submit" variant="primary" size="sm">Approve</Button>
              </form>
              <form action={approvalDecision}>
                <input type="hidden" name="id" value={job.id} />
                <input type="hidden" name="decision" value="DENIED" />
                <Button type="submit" variant="danger" size="sm">Deny</Button>
              </form>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Estimates */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Estimates</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <EstimateRow
              label="Insurance Retail"
              description="What the insurance company will pay — maximized line items."
              estimate={insurance}
              jobId={job.id}
              estimateType="INSURANCE_RETAIL"
            />
            <div className="border-t border-(--color-border)" />
            <EstimateRow
              label="Subcontractor"
              description="What SMG will charge the roofing company."
              estimate={subcontractor}
              jobId={job.id}
              estimateType="SUBCONTRACTOR"
            />
          </CardBody>
        </Card>

        {/* Lifecycle */}
        <Card>
          <CardHeader><CardTitle>Lifecycle</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {job.status !== "CANCELLED" && job.approvalStatus !== "PENDING" ? (
              <form action={transitionJobStatus} className="space-y-2">
                <input type="hidden" name="id" value={job.id} />
                <Label>Change status</Label>
                <Select name="status" defaultValue={job.status}>
                  {JOB_STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{JOB_STATUS_LABEL[s]}</option>
                  ))}
                </Select>
                <div className="flex justify-end">
                  <Button type="submit" size="sm">Update</Button>
                </div>
                <p className="text-[11px] text-(--color-muted-foreground)">
                  Jobs can move backward; unusual reverses trigger an owner alert.
                </p>
              </form>
            ) : null}

            {job.status !== "CANCELLED" ? (
              <form action={cancelJob} className="border-t border-(--color-border) pt-3 space-y-2">
                <input type="hidden" name="id" value={job.id} />
                <Label>Cancel job</Label>
                <Textarea name="reason" rows={2} placeholder="Reason (required)" required />
                <div className="flex justify-end">
                  <Button type="submit" variant="danger" size="sm">Cancel job</Button>
                </div>
              </form>
            ) : (
              <div className="text-xs text-(--color-muted-foreground)">
                <strong>Cancelled:</strong> {job.cancellationReason ?? "—"}
              </div>
            )}

            <div className="border-t border-(--color-border) pt-3 text-xs text-(--color-muted-foreground) space-y-1">
              <div>Status history</div>
              <ul className="space-y-0.5">
                {history.slice().reverse().slice(0, 8).map((h, i) => (
                  <li key={i}>
                    {JOB_STATUS_LABEL[h.status as keyof typeof JOB_STATUS_LABEL] ?? h.status}
                    {h.backward ? " (backward)" : ""} ·{" "}
                    {formatDistanceToNow(new Date(h.changed_at), { addSuffix: true })}
                  </li>
                ))}
              </ul>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Commission (rep-visible) */}
      <Card>
        <CardHeader><CardTitle>Commission</CardTitle></CardHeader>
        <CardBody className="grid gap-3 md:grid-cols-4 text-sm">
          <Stat label="Estimate" value={formatMoney(job.repCommission)} />
          <Stat label="Status" value={job.commissionStatus} />
          <Stat label="Quarter" value={job.commissionQuarter ?? "—"} />
          <Stat label="Locked" value={job.commissionLocked ? "Yes" : "No"} />

          {session.user.role === "OWNER" ? (
            <div className="md:col-span-4 border-t border-(--color-border) pt-3 grid gap-3 md:grid-cols-2">
              <form action={overrideCommissionQuarter} className="space-y-1.5">
                <input type="hidden" name="id" value={job.id} />
                <Label>Override commission quarter</Label>
                <Input name="quarter" placeholder="2026-Q2" defaultValue={job.commissionQuarter ?? ""} />
                <Input name="reason" placeholder="Reason (optional)" />
                <Button type="submit" variant="outline" size="sm">Save override</Button>
              </form>
              {job.commissionStatus === "ELIGIBLE" ? (
                <form action={markCommissionPaid} className="self-end">
                  <input type="hidden" name="id" value={job.id} />
                  <Button type="submit" size="sm">Mark commission paid</Button>
                </form>
              ) : null}
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* Costs & profit (admin only) */}
      {seeCosts ? (
        <Card>
          <CardHeader><CardTitle>Costs &amp; profit</CardTitle></CardHeader>
          <CardBody className="grid gap-3 md:grid-cols-3">
            <Stat label="Insurance total" value={formatMoney(job.insuranceEstimateTotal)} />
            <Stat label="Subcontractor total" value={formatMoney(job.subcontractorEstimateTotal)} />
            <Stat label="Actual cost" value={formatMoney(job.actualCost)} />
            <Stat
              label="Profit snapshot"
              value={formatMoney(job.profitSnapshot)}
              accent={job.profitSnapshot != null && Number(job.profitSnapshot) < 0 ? "warning" : "accent"}
            />
            <Stat
              label="Snapshot frozen at"
              value={job.profitSnapshotDate ? format(job.profitSnapshotDate, "MMM d, yyyy") : "—"}
            />

            <form action={enterCosts} className="md:col-span-3 border-t border-(--color-border) pt-3 grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={job.id} />
              <div className="space-y-1.5">
                <Label>Actual cost ($)</Label>
                <Input
                  name="actualCost"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={job.actualCost ? Number(job.actualCost).toFixed(2) : ""}
                  required
                />
              </div>
              {job.profitSnapshotDate ? (
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Revised margin note (required after snapshot is frozen)</Label>
                  <Textarea name="revisedMarginNote" rows={2} defaultValue={job.revisedMarginNote ?? ""} />
                </div>
              ) : (
                <div className="md:col-span-2 text-xs text-(--color-muted-foreground) self-end">
                  The profit snapshot is frozen on first cost entry.
                </div>
              )}
              <div className="md:col-span-3 flex justify-end">
                <Button type="submit" size="sm">Save costs</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function EstimateRow({
  label,
  description,
  estimate,
  jobId,
  estimateType,
}: {
  label: string;
  description: string;
  estimate:
    | {
        id: string;
        totalAmount: { toString: () => string } | number | null;
        versionNumber: number;
      }
    | undefined;
  jobId: string;
  estimateType: "INSURANCE_RETAIL" | "SUBCONTRACTOR";
}) {
  if (!estimate) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-(--color-muted-foreground)">{description}</div>
        </div>
        <form action={createEstimate}>
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="estimateType" value={estimateType} />
          <Button type="submit" variant="outline" size="sm">Start estimate</Button>
        </form>
      </div>
    );
  }
  const total = Number(estimate.totalAmount ?? 0);
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <div className="text-sm font-medium">{label} <span className="text-xs text-(--color-muted-foreground)">· v{estimate.versionNumber}</span></div>
        <div className="text-xs text-(--color-muted-foreground)">{description}</div>
        <div className="mt-1 text-lg font-semibold">${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
      </div>
      <Link href={`/jobs/${jobId}/estimates/${estimate.id}`}>
        <Button variant="outline" size="sm">Open</Button>
      </Link>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "accent" | "warning" }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-(--color-muted-foreground)">{label}</div>
      <div
        className={
          "mt-1 text-base font-medium " +
          (accent === "accent" ? "text-(--color-accent)" : accent === "warning" ? "text-(--color-warning)" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}

function formatMoney(v: unknown): string {
  if (v == null) return "—";
  const n = Number(v);
  if (!isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
