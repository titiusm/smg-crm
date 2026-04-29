import Link from "next/link";
import { requireRole } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { sendgridConfigured } from "@/lib/sendgrid";
import { format } from "date-fns";

export default async function CampaignsPage() {
  await requireRole(["OWNER", "LIMITED_ADMIN"]);
  const campaigns = await prisma.emailCampaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { emails: true, recipients: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-(--color-muted-foreground)">
            Email drip sequences. Recipients are auto-excluded if DNC / unsubscribed.
          </p>
        </div>
        <Link href="/campaigns/new"><Button>New campaign</Button></Link>
      </div>

      {!sendgridConfigured() ? (
        <Card>
          <CardBody className="text-sm text-(--color-danger)">
            SendGrid is not configured (SENDGRID_API_KEY missing). Campaigns can be built, but nothing will send.
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>All campaigns</CardTitle></CardHeader>
        <CardBody className="p-0">
          {campaigns.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-(--color-muted-foreground)">
              No campaigns yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-(--color-border) bg-(--color-muted)/40">
                <tr className="text-left text-xs uppercase tracking-wide text-(--color-muted-foreground)">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Emails</th>
                  <th className="px-4 py-2">Recipients</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2 text-xs">{c.type.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2">
                      <Badge variant={c.status === "ACTIVE" ? "success" : c.status === "PAUSED" ? "warning" : "muted"}>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs">{c._count.emails}</td>
                    <td className="px-4 py-2 text-xs">{c._count.recipients}</td>
                    <td className="px-4 py-2 text-xs">{format(c.createdAt, "MMM d, yyyy")}</td>
                    <td className="px-4 py-2">
                      <Link href={`/campaigns/${c.id}`}>
                        <Button variant="outline" size="sm">Open</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
