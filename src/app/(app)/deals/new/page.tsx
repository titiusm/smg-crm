import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { createDeal } from "../actions";
import { canManageDeals, isScopedToOwnCompanies } from "@/lib/rbac";
import { format } from "date-fns";

export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const session = await auth();
  if (!session) return null;
  if (!canManageDeals(session.user.role)) redirect("/");
  const { companyId } = await searchParams;
  if (!companyId) notFound();

  const company = await prisma.company.findUnique({ where: { id: companyId } });
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
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">New deal</h1>
        <p className="text-sm text-(--color-muted-foreground)">
          Standing pricing agreement for <strong>{company.companyName}</strong>.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle>Deal terms</CardTitle></CardHeader>
        <CardBody>
          <form action={createDeal} className="space-y-4">
            <input type="hidden" name="companyId" value={company.id} />
            <div className="space-y-1.5">
              <Label>Deal type</Label>
              <Select name="dealType" defaultValue="FLAT_RATE_PER_PANEL">
                <option value="FLAT_RATE_PER_PANEL">Flat rate per panel</option>
                <option value="PERCENTAGE_OF_INSURANCE_PAYOUT">Percentage of insurance payout</option>
                <option value="CUSTOM">Custom</option>
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Flat rate — price per panel ($)</Label>
                <Input name="pricePerPanel" type="number" step="0.01" min={0} placeholder="175.00" />
                <p className="text-[11px] text-(--color-muted-foreground)">
                  Jobs below $150/panel will require owner approval.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Percentage of insurance payout (%)</Label>
                <Input name="percentage" type="number" step="1" min={0} max={100} placeholder="60" />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Custom description</Label>
                <Input name="customDescription" placeholder="e.g. sliding scale by panel count" />
              </div>
              <div className="space-y-1.5">
                <Label>Custom terms</Label>
                <Input name="customTerms" placeholder="e.g. 1–20 panels $200, 21+ $175" />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Effective date</Label>
                <Input name="effectiveDate" type="date" required defaultValue={format(new Date(), "yyyy-MM-dd")} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiration date (optional)</Label>
                <Input name="expirationDate" type="date" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea name="termsNotes" rows={3} />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Link href={`/companies/${company.id}`}><Button variant="outline" type="button">Cancel</Button></Link>
              <Button type="submit">Save deal</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
