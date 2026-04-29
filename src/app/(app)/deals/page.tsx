import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { scopedCompanyWhere } from "@/lib/companies";

export default async function DealsPage() {
  const session = await auth();
  if (!session) return null;
  const scope = { userId: session.user.id, role: session.user.role };

  const deals = await prisma.deal.findMany({
    where: { company: scopedCompanyWhere(scope) },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { company: true, negotiatedBy: true },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deals</h1>
          <p className="text-sm text-(--color-muted-foreground)">
            Standing pricing agreements with roofing companies.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>All deals</CardTitle></CardHeader>
        <CardBody className="p-0">
          {deals.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-(--color-muted-foreground)">
              No deals yet. Create one from a company profile.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-(--color-border) bg-(--color-muted)/40">
                <tr className="text-left text-xs uppercase tracking-wide text-(--color-muted-foreground)">
                  <th className="px-4 py-2">Company</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Pricing</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Effective</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {deals.map((d) => {
                  const p = d.pricingDetails as { type: string; price_per_panel?: number; rate?: number; description?: string };
                  const pricing =
                    p.type === "flat_rate"
                      ? `$${Number(p.price_per_panel ?? 0).toFixed(2)}/panel`
                      : p.type === "percentage_of_payout"
                      ? `${Number((p.rate ?? 0) * 100).toFixed(0)}% of payout`
                      : p.description ?? "Custom";
                  return (
                    <tr key={d.id}>
                      <td className="px-4 py-2">
                        <Link href={`/companies/${d.companyId}`} className="font-medium hover:text-(--color-accent)">
                          {d.company.companyName}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs">{d.dealType.replace(/_/g, " ")}</td>
                      <td className="px-4 py-2 text-xs">{pricing}</td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            d.status === "ACTIVE"
                              ? "success"
                              : d.status === "PENDING_APPROVAL"
                              ? "warning"
                              : "muted"
                          }
                        >
                          {d.status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {format(d.effectiveDate, "MMM d, yyyy")}
                        {d.expirationDate ? ` – ${format(d.expirationDate, "MMM d, yyyy")}` : ""}
                      </td>
                      <td className="px-4 py-2">
                        <Link href={`/companies/${d.companyId}`}>
                          <Button variant="outline" size="sm">Open</Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
