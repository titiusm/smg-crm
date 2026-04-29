import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Badge,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { CommsButtons } from "./_comms-panel";
import {
  updateCompany,
  softDeleteCompany,
  addActivityNote,
  logMeeting,
} from "../actions";
import {
  COMPANY_STATUS_LABEL,
  COMPANY_STATUS_ORDER,
  DEAL_FLOW_TIER_LABEL,
} from "@/lib/companies";
import { canDeleteCompany, isScopedToOwnCompanies } from "@/lib/rbac";
import { formatPhoneForDisplay, pluralize } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import { Ban, Trash2, Calendar } from "lucide-react";

export default async function CompanyProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) return null;
  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      assignedRep: true,
      contacts: { orderBy: [{ isPrimaryContact: "desc" }, { createdAt: "asc" }] },
      deals: { orderBy: { createdAt: "desc" } },
      agreements: { orderBy: { createdAt: "desc" } },
      jobs: {
        where: { deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 10,
      },
    },
  });

  if (!company || company.deletedAt) notFound();
  if (
    isScopedToOwnCompanies(session.user.role) &&
    company.assignedRepId !== session.user.id
  ) {
    redirect("/companies");
  }

  const [activities, reps] = await Promise.all([
    prisma.activity.findMany({
      where: { companyId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { rep: true, contact: true },
    }),
    isScopedToOwnCompanies(session.user.role)
      ? []
      : prisma.user.findMany({
          where: { role: "SALES_REP", isActive: true },
          orderBy: { firstName: "asc" },
        }),
  ]);

  const daysSinceLast = company.dateLastProject
    ? Math.floor(
        (Date.now() - company.dateLastProject.getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;
  const isDormant = daysSinceLast != null && daysSinceLast >= 90;
  const anyDnc = company.doNotCall || company.doNotEmail || company.doNotText;
  const canHardDelete = canDeleteCompany(session.user.role, session.user.permissions);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <Link
            href="/companies"
            className="text-xs text-(--color-muted-foreground) hover:text-(--color-foreground)"
          >
            ← Back to companies
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{company.companyName}</h1>
            <Badge variant="accent">{COMPANY_STATUS_LABEL[company.status]}</Badge>
            {isDormant ? (
              <Badge variant="warning">
                Dormant · {pluralize(daysSinceLast!, "day")} since last project
              </Badge>
            ) : null}
            {anyDnc ? (
              <Badge variant="danger">
                <Ban className="h-3 w-3" /> DNC
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--color-muted-foreground)">
            {company.assignedRep ? (
              <span>
                Assigned to {company.assignedRep.firstName} {company.assignedRep.lastName}
              </span>
            ) : (
              <span>Unassigned</span>
            )}
            {company.googleRating ? (
              <span>
                {company.googleRating}★ ({company.googleReviewCount ?? 0} reviews)
              </span>
            ) : null}
            {company.website ? (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-(--color-accent)"
              >
                {company.website}
              </a>
            ) : null}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap items-center gap-2">
          <CommsButtons
            companyId={company.id}
            primaryContact={
              company.contacts.find((c) => c.isPrimaryContact) ?? company.contacts[0] ?? null
                ? {
                    id: (company.contacts.find((c) => c.isPrimaryContact) ?? company.contacts[0])!.id,
                    firstName: (company.contacts.find((c) => c.isPrimaryContact) ?? company.contacts[0])!.firstName,
                    lastName: (company.contacts.find((c) => c.isPrimaryContact) ?? company.contacts[0])!.lastName ?? null,
                    email: (company.contacts.find((c) => c.isPrimaryContact) ?? company.contacts[0])!.email ?? null,
                    phoneNumber: (company.contacts.find((c) => c.isPrimaryContact) ?? company.contacts[0])!.phoneNumber ?? null,
                    doNotCall: (company.contacts.find((c) => c.isPrimaryContact) ?? company.contacts[0])!.doNotCall,
                    doNotEmail: (company.contacts.find((c) => c.isPrimaryContact) ?? company.contacts[0])!.doNotEmail,
                    doNotText: (company.contacts.find((c) => c.isPrimaryContact) ?? company.contacts[0])!.doNotText,
                  }
                : null
            }
            companyFlags={{
              doNotCall: company.doNotCall,
              doNotEmail: company.doNotEmail,
              doNotText: company.doNotText,
              hasPhone: !!company.phoneNumber,
              hasEmail: !!company.email,
            }}
            canCallText={
              !!(session.user.twilioPhoneNumber) ||
              session.user.role === "OWNER" ||
              session.user.role === "LIMITED_ADMIN"
            }
            canEmail={!!process.env.SENDGRID_API_KEY && !!process.env.SENDGRID_FROM_EMAIL}
          />
          <Link href={`/jobs/new?companyId=${company.id}`}>
            <Button size="sm" variant="primary">+ New Job</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT: Edit form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardBody>
            <form action={updateCompany} className="space-y-4">
              <input type="hidden" name="id" value={company.id} />
              <Field label="Company name">
                <Input name="companyName" defaultValue={company.companyName} required />
              </Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Phone">
                  <Input
                    name="phoneNumber"
                    defaultValue={formatPhoneForDisplay(company.phoneNumber) || ""}
                  />
                </Field>
                <Field label="Email">
                  <Input name="email" type="email" defaultValue={company.email ?? ""} />
                </Field>
              </div>
              <Field label="Website">
                <Input name="website" defaultValue={company.website ?? ""} />
              </Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Street">
                  <Input name="addressStreet" defaultValue={company.addressStreet ?? ""} />
                </Field>
                <Field label="City">
                  <Input name="addressCity" defaultValue={company.addressCity ?? ""} />
                </Field>
                <Field label="State">
                  <Input
                    name="addressState"
                    defaultValue={company.addressState ?? ""}
                  />
                </Field>
                <Field label="Zip">
                  <Input name="addressZip" defaultValue={company.addressZip ?? ""} />
                </Field>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Status">
                  <Select name="status" defaultValue={company.status}>
                    {COMPANY_STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {COMPANY_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Deal-flow tier">
                  <Select name="dealFlowTier" defaultValue={company.dealFlowTier}>
                    {Object.entries(DEAL_FLOW_TIER_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                {!isScopedToOwnCompanies(session.user.role) ? (
                  <Field label="Assigned rep">
                    <Select name="assignedRepId" defaultValue={company.assignedRepId ?? ""}>
                      <option value="">Unassigned</option>
                      {reps.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.firstName} {r.lastName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Next action type">
                  <Input
                    name="nextActionType"
                    defaultValue={company.nextActionType ?? ""}
                    placeholder="Follow-up call"
                  />
                </Field>
                <Field label="Next action date">
                  <Input
                    name="nextActionDate"
                    type="date"
                    defaultValue={
                      company.nextActionDate
                        ? format(company.nextActionDate, "yyyy-MM-dd")
                        : ""
                    }
                  />
                </Field>
              </div>

              <div>
                <Label className="mb-2 block">Do Not Contact</Label>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="doNotCall"
                      defaultChecked={company.doNotCall}
                    />
                    Do not call
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="doNotEmail"
                      defaultChecked={company.doNotEmail}
                    />
                    Do not email
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="doNotText"
                      defaultChecked={company.doNotText}
                    />
                    Do not text
                  </label>
                </div>
              </div>

              <Field label="Notes">
                <Textarea name="notes" rows={3} defaultValue={company.notes ?? ""} />
              </Field>

              <div className="flex items-center justify-between gap-2 pt-2">
                {/* formAction routes this specific button to the delete action.
                    The hidden `id` input above is reused. Avoids nested <form>. */}
                <Button
                  variant="danger"
                  type="submit"
                  size="sm"
                  formAction={softDeleteCompany}
                  formNoValidate
                >
                  <Trash2 className="h-4 w-4" />
                  {canHardDelete ? "Delete company" : "Close / Inactive"}
                </Button>
                <Button type="submit">Save changes</Button>
              </div>
            </form>
          </CardBody>
        </Card>

        {/* RIGHT: Contacts, Deals, Note entry */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Contacts</CardTitle>
              <Link
                href={`/companies/${company.id}/contacts/new`}
                className="text-xs text-(--color-accent) hover:underline"
              >
                + Add
              </Link>
            </CardHeader>
            <CardBody className="p-0">
              {company.contacts.length === 0 ? (
                <div className="px-5 py-6 text-center text-xs text-(--color-muted-foreground)">
                  No contacts yet.
                </div>
              ) : (
                <ul className="divide-y divide-(--color-border)">
                  {company.contacts.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-2 px-5 py-3 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium">
                          {c.firstName} {c.lastName ?? ""}
                          {c.isPrimaryContact ? (
                            <Badge variant="accent" className="ml-2 text-[10px]">
                              Primary
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-(--color-muted-foreground)">
                          {c.roleTitle ?? ""}
                          {c.email ? ` · ${c.email}` : ""}
                          {c.phoneNumber ? ` · ${formatPhoneForDisplay(c.phoneNumber)}` : ""}
                        </div>
                      </div>
                      {c.doNotCall || c.doNotEmail || c.doNotText ? (
                        <Badge variant="danger" className="text-[10px]">DNC</Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Deals</CardTitle>
              <Link
                href={`/deals/new?companyId=${company.id}`}
                className="text-xs text-(--color-accent) hover:underline"
              >
                + New deal
              </Link>
            </CardHeader>
            <CardBody className="p-0">
              {company.deals.length === 0 ? (
                <div className="px-5 py-6 text-center text-xs text-(--color-muted-foreground)">
                  No standing pricing agreements yet.
                </div>
              ) : (
                <ul className="divide-y divide-(--color-border)">
                  {company.deals.map((d) => (
                    <li key={d.id} className="px-5 py-3 text-sm">
                      <Link href={`/deals/${d.id}`} className="block hover:text-(--color-accent)">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {d.dealType.replace(/_/g, " ")}
                          </span>
                          <Badge variant={d.status === "ACTIVE" ? "success" : "muted"}>
                            {d.status}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-[11px] text-(--color-muted-foreground)">
                          Effective {format(d.effectiveDate, "MMM d, yyyy")}
                          {d.expirationDate ? ` – ${format(d.expirationDate, "MMM d, yyyy")}` : ""}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Jobs</CardTitle>
              <Link
                href={`/jobs/new?companyId=${company.id}`}
                className="text-xs text-(--color-accent) hover:underline"
              >
                + New job
              </Link>
            </CardHeader>
            <CardBody className="p-0">
              {company.jobs.length === 0 ? (
                <div className="px-5 py-6 text-center text-xs text-(--color-muted-foreground)">
                  No jobs yet.
                </div>
              ) : (
                <ul className="divide-y divide-(--color-border) text-sm">
                  {company.jobs.map((j) => (
                    <li key={j.id} className="px-5 py-3">
                      <Link href={`/jobs/${j.id}`} className="block hover:text-(--color-accent)">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {j.panelCount ?? "?"} panels
                            {j.pricePerPanel ? ` · $${Number(j.pricePerPanel).toFixed(0)}/pnl` : ""}
                          </span>
                          <Badge
                            variant={
                              j.status === "PAID"
                                ? "success"
                                : j.approvalStatus === "PENDING"
                                ? "warning"
                                : j.status === "CANCELLED"
                                ? "muted"
                                : "accent"
                            }
                          >
                            {j.status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-[11px] text-(--color-muted-foreground)">
                          {j.subcontractorEstimateTotal
                            ? `$${Number(j.subcontractorEstimateTotal).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                            : "no estimate yet"}
                          {j.dateEstimateSent ? ` · ${format(j.dateEstimateSent, "MMM d, yyyy")}` : ""}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Quick log</CardTitle></CardHeader>
            <CardBody>
              <form action={addActivityNote} className="space-y-2">
                <input type="hidden" name="companyId" value={company.id} />
                <Label htmlFor="note">Add a note</Label>
                <Textarea id="note" name="notes" rows={3} placeholder="Spoke with Jamie — needs quote by Friday." />
                <div className="flex justify-end">
                  <Button type="submit" size="sm">Save note</Button>
                </div>
              </form>
              <div className="mt-4 border-t border-(--color-border) pt-4">
                <form action={logMeeting} className="space-y-2">
                  <input type="hidden" name="companyId" value={company.id} />
                  <Label>Log a meeting</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input name="meetingDate" type="date" defaultValue={format(new Date(), "yyyy-MM-dd")} />
                    <Select name="meetingType" defaultValue="IN_PERSON">
                      <option value="IN_PERSON">In-person</option>
                      <option value="PHONE">Phone</option>
                      <option value="VIDEO">Video</option>
                    </Select>
                  </div>
                  <Textarea name="meetingOutcome" rows={2} placeholder="Outcome / notes" required />
                  <div className="flex justify-end">
                    <Button type="submit" variant="outline" size="sm">
                      <Calendar className="h-4 w-4" /> Log meeting
                    </Button>
                  </div>
                </form>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Activity timeline */}
      <Card>
        <CardHeader><CardTitle>Activity timeline</CardTitle></CardHeader>
        <CardBody className="p-0">
          {activities.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-(--color-muted-foreground)">
              No activity logged yet.
            </div>
          ) : (
            <ul className="divide-y divide-(--color-border)">
              {activities.map((a) => (
                <li key={a.id} className="px-5 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="muted" className="text-[10px]">
                          {a.activityType.replace(/_/g, " ")}
                        </Badge>
                        {a.direction ? (
                          <Badge variant="muted" className="text-[10px]">
                            {a.direction}
                          </Badge>
                        ) : null}
                        {a.subject ? <span className="font-medium truncate">{a.subject}</span> : null}
                      </div>
                      {a.detailedNotes ? (
                        <p className="mt-1 whitespace-pre-wrap text-(--color-foreground)">{a.detailedNotes}</p>
                      ) : null}
                      {a.meetingOutcome ? (
                        <p className="mt-1 whitespace-pre-wrap">{a.meetingOutcome}</p>
                      ) : null}
                    </div>
                    <div className="whitespace-nowrap text-[11px] text-(--color-muted-foreground)">
                      {a.rep ? `${a.rep.firstName} ${a.rep.lastName} · ` : ""}
                      {formatDistanceToNow(a.createdAt, { addSuffix: true })}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}


function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required ? <span className="text-(--color-danger)"> *</span> : null}</Label>
      {children}
    </div>
  );
}
