import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { createJob } from "../actions";
import { suggestPriceFromDeal } from "@/lib/jobs";
import { isScopedToOwnCompanies } from "@/lib/rbac";

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const session = await auth();
  if (!session) return null;
  const { companyId } = await searchParams;
  if (!companyId) notFound();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      contacts: true,
      deals: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!company || company.deletedAt) notFound();
  if (isScopedToOwnCompanies(session.user.role) && company.assignedRepId !== session.user.id) {
    redirect("/companies");
  }

  const activeDeal = company.deals[0] ?? null;
  const suggestion = suggestPriceFromDeal(activeDeal, null, null);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link href={`/companies/${company.id}`} className="text-xs text-(--color-muted-foreground) hover:text-(--color-foreground)">
          ← Back to {company.companyName}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">New job</h1>
        <p className="text-sm text-(--color-muted-foreground)">
          Create a job for <strong>{company.companyName}</strong>.
        </p>
      </div>

      {activeDeal ? (
        <Card>
          <CardBody className="text-sm">
            <div className="text-xs uppercase tracking-wide text-(--color-muted-foreground)">
              Active standing deal
            </div>
            <div className="mt-1 font-medium">{activeDeal.dealType.replace(/_/g, " ")}</div>
            <div className="text-xs text-(--color-muted-foreground)">{suggestion.note}</div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardBody>
          <form action={createJob} className="space-y-4">
            <input type="hidden" name="companyId" value={company.id} />
            {activeDeal ? <input type="hidden" name="dealId" value={activeDeal.id} /> : null}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Job type</Label>
                <Select name="jobType" defaultValue="DETACH_AND_REINSTALL">
                  <option value="DETACH_AND_REINSTALL">Detach &amp; Reinstall</option>
                  <option value="DETACH_ONLY">Detach only</option>
                  <option value="DIRECT_CUSTOMER">Direct customer</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Contact (who sent the job)</Label>
                <Select name="contactId" defaultValue="">
                  <option value="">—</option>
                  {company.contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName ?? ""}{c.roleTitle ? ` · ${c.roleTitle}` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Job address</Label>
              <Input name="jobAddressStreet" placeholder="Street" defaultValue={company.addressStreet ?? ""} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Input name="jobAddressCity" placeholder="City" defaultValue={company.addressCity ?? ""} />
              <Input name="jobAddressState" placeholder="State" defaultValue={company.addressState ?? ""} />
              <Input name="jobAddressZip" placeholder="Zip" defaultValue={company.addressZip ?? ""} />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Panel count</Label>
                <Input name="panelCount" type="number" min={0} />
              </div>
              <div className="space-y-1.5">
                <Label>Price per panel ($)</Label>
                <Input
                  name="pricePerPanel"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={suggestion.pricePerPanel?.toFixed(2) ?? ""}
                />
                <p className="text-[11px] text-(--color-muted-foreground)">
                  Below $150/panel requires owner approval.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Insurance company</Label>
                <Input name="insuranceCompanyName" placeholder="Optional" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Insurance estimate total ($)</Label>
                <Input name="insuranceEstimateTotal" type="number" step="0.01" min={0} />
                <p className="text-[11px] text-(--color-muted-foreground)">
                  You can skip this — it auto-fills from the estimate builder.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Subcontractor estimate total ($)</Label>
                <Input name="subcontractorEstimateTotal" type="number" step="0.01" min={0} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea name="notes" rows={3} />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Link href={`/companies/${company.id}`}><Button variant="outline" type="button">Cancel</Button></Link>
              <Button type="submit">Create job</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
