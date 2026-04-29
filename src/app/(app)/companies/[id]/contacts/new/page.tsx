import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Input, Label, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { createContact } from "../actions";
import { isScopedToOwnCompanies } from "@/lib/rbac";

export default async function NewContactPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return null;
  const { id } = await params;

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company || company.deletedAt) notFound();
  if (isScopedToOwnCompanies(session.user.role) && company.assignedRepId !== session.user.id) {
    redirect("/companies");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link href={`/companies/${company.id}`} className="text-xs text-(--color-muted-foreground) hover:text-(--color-foreground)">
          ← Back to {company.companyName}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Add contact</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Contact details</CardTitle></CardHeader>
        <CardBody>
          <form action={createContact} className="space-y-4">
            <input type="hidden" name="companyId" value={company.id} />
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="First name" required><Input name="firstName" required /></Field>
              <Field label="Last name"><Input name="lastName" /></Field>
            </div>
            <Field label="Role / title"><Input name="roleTitle" placeholder="Project Manager" /></Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Phone"><Input name="phoneNumber" /></Field>
              <Field label="Email"><Input name="email" type="email" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isPrimaryContact" value="true" />
              Primary contact for this company
            </label>
            <div>
              <Label className="mb-2 block">Do Not Contact</Label>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" name="doNotCall" value="true" /> Do not call</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="doNotEmail" value="true" /> Do not email</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="doNotText" value="true" /> Do not text</label>
              </div>
            </div>
            <Field label="Notes"><Textarea name="notes" rows={3} /></Field>
            <div className="flex justify-end gap-2 pt-2">
              <Link href={`/companies/${company.id}`}><Button variant="outline" type="button">Cancel</Button></Link>
              <Button type="submit">Add contact</Button>
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
