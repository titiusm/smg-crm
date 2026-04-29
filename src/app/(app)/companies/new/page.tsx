import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { createCompany } from "../actions";
import { COMPANY_STATUS_LABEL, COMPANY_STATUS_ORDER, DEAL_FLOW_TIER_LABEL } from "@/lib/companies";
import { isScopedToOwnCompanies } from "@/lib/rbac";

export default async function NewCompanyPage() {
  const session = await auth();
  if (!session) return null;

  const reps = isScopedToOwnCompanies(session.user.role)
    ? []
    : await prisma.user.findMany({
        where: { role: "SALES_REP", isActive: true },
        orderBy: { firstName: "asc" },
      });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link href="/companies" className="text-xs text-(--color-muted-foreground) hover:text-(--color-foreground)">
          ← Back to companies
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">New company</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Company details</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={createCompany} className="space-y-4">
            <Field label="Company name" required>
              <Input name="companyName" required />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Phone number"><Input name="phoneNumber" placeholder="(512) 555-1234" /></Field>
              <Field label="Email"><Input name="email" type="email" /></Field>
            </div>
            <Field label="Website">
              <Input name="website" placeholder="https://" />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Street">
                <Input name="addressStreet" />
              </Field>
              <Field label="City">
                <Input name="addressCity" />
              </Field>
              <Field label="State">
                <Input name="addressState" placeholder="Texas" />
              </Field>
              <Field label="Zip">
                <Input name="addressZip" />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Status">
                <Select name="status" defaultValue="COLD">
                  {COMPANY_STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{COMPANY_STATUS_LABEL[s]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Deal-flow tier">
                <Select name="dealFlowTier" defaultValue="NEW_UNKNOWN">
                  {Object.entries(DEAL_FLOW_TIER_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Select>
              </Field>
              {reps.length > 0 ? (
                <Field label="Assigned rep">
                  <Select name="assignedRepId" defaultValue="">
                    <option value="">Unassigned</option>
                    {reps.map((r) => (
                      <option key={r.id} value={r.id}>{r.firstName} {r.lastName}</option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Google review count"><Input name="googleReviewCount" type="number" min={0} /></Field>
              <Field label="Google rating"><Input name="googleRating" type="number" step="0.1" min={0} max={5} /></Field>
            </div>
            <Field label="Notes">
              <Textarea name="notes" rows={3} />
            </Field>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Link href="/companies"><Button variant="outline" type="button">Cancel</Button></Link>
              <Button type="submit">Create company</Button>
            </div>
          </form>
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
