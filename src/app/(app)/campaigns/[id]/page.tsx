import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Badge, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { addCampaignEmail, pauseCampaign, resumeCampaign } from "../actions";
import { COMPANY_STATUS_LABEL, COMPANY_STATUS_ORDER, DEAL_FLOW_TIER_LABEL } from "@/lib/companies";
import { AudiencePicker } from "./_audience-picker";
import { format } from "date-fns";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["OWNER", "LIMITED_ADMIN"]);
  const { id } = await params;
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id },
    include: {
      emails: { orderBy: { sequenceOrder: "asc" } },
      _count: { select: { recipients: true } },
    },
  });
  if (!campaign) notFound();

  const recipientStats = await prisma.campaignRecipientTracking.groupBy({
    by: ["status"],
    where: { campaignId: id },
    _count: { _all: true },
  });
  const statsMap = Object.fromEntries(recipientStats.map((r) => [r.status, r._count._all]));

  const filter = (campaign.targetFilter as { status?: string; dealFlowTier?: string; assignedRepId?: string }) ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/campaigns" className="text-xs text-(--color-muted-foreground) hover:text-(--color-foreground)">
            ← Back to campaigns
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
            <Badge
              variant={
                campaign.status === "ACTIVE" ? "success" :
                campaign.status === "PAUSED" ? "warning" : "muted"
              }
            >
              {campaign.status}
            </Badge>
            <span className="text-xs text-(--color-muted-foreground)">{campaign.type.replace(/_/g, " ")}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-6">
        <Stat label="Recipients" value={campaign._count.recipients} />
        <Stat label="Queued" value={statsMap.QUEUED ?? 0} />
        <Stat label="Sent" value={statsMap.SENT ?? 0} accent="accent" />
        <Stat label="Delivered" value={statsMap.DELIVERED ?? 0} accent="accent" />
        <Stat label="Opened / clicked" value={(statsMap.OPENED ?? 0) + (statsMap.CLICKED ?? 0)} accent="accent" />
        <Stat label="Bounced / unsub" value={(statsMap.BOUNCED ?? 0) + (statsMap.UNSUBSCRIBED ?? 0)} accent="warning" />
      </div>

      <Card>
        <CardHeader><CardTitle>Emails (in sequence)</CardTitle></CardHeader>
        <CardBody className="p-0">
          {campaign.emails.length === 0 ? (
            <div className="px-5 py-6 text-center text-xs text-(--color-muted-foreground)">
              No emails yet. Add at least one below.
            </div>
          ) : (
            <ul className="divide-y divide-(--color-border)">
              {campaign.emails.map((e) => (
                <li key={e.id} className="px-5 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="muted">Step {e.sequenceOrder}</Badge>
                        <span className="font-medium">{e.subjectLine}</span>
                      </div>
                      <div className="text-[11px] text-(--color-muted-foreground) mt-1">
                        Delay: {e.delayDays}d
                        {e.autoFollowUp ? ` · auto follow-up on ${e.followUpCondition}` : ""}
                      </div>
                    </div>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap rounded-[8px] bg-(--color-muted) p-2 text-[11px]">{e.bodyTemplate}</pre>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Add email to sequence</CardTitle></CardHeader>
        <CardBody>
          <form action={addCampaignEmail} className="space-y-3">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input name="subjectLine" placeholder="Hi {{contact_first_name}}, quick intro" required />
            </div>
            <div className="space-y-1.5">
              <Label>Body (HTML; merge fields: {"{{company_name}}, {{contact_first_name}}, {{contact_name}}"})</Label>
              <Textarea name="bodyTemplate" rows={8} required />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Delay after previous (days)</Label>
                <Input name="delayDays" type="number" min={0} defaultValue={campaign.emails.length === 0 ? 0 : 3} />
              </div>
              <div className="space-y-1.5">
                <Label>Auto follow-up condition</Label>
                <Select name="followUpCondition" defaultValue="">
                  <option value="">—</option>
                  <option value="NO_OPEN">If not opened</option>
                  <option value="NO_REPLY">If no reply</option>
                  <option value="NO_CLICK">If no click</option>
                </Select>
              </div>
              <label className="flex items-end gap-2 pb-1.5 text-sm">
                <input type="checkbox" name="autoFollowUp" />
                Enable auto follow-up
              </label>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" size="sm">Add step</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {campaign.status === "DRAFT" ? (
        <Card>
          <CardHeader><CardTitle>Audience + launch</CardTitle></CardHeader>
          <CardBody>
            <AudiencePicker
              campaignId={campaign.id}
              statusOrder={COMPANY_STATUS_ORDER}
              statusLabels={COMPANY_STATUS_LABEL}
              tierLabels={DEAL_FLOW_TIER_LABEL}
              hasEmails={campaign.emails.length > 0}
              initialFilter={filter}
            />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="flex items-center justify-between">
            <div className="text-sm text-(--color-muted-foreground)">
              Launched {format(campaign.updatedAt, "MMM d, yyyy")}. Tick the runner to send queued messages:
              <code className="mx-2 rounded bg-(--color-muted) px-1 py-0.5 text-[11px]">
                curl -X POST {process.env.APP_URL ?? "http://localhost:3001"}/api/campaigns/tick
              </code>
            </div>
            <div className="flex gap-2">
              {campaign.status === "ACTIVE" ? (
                <form action={pauseCampaign}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <Button type="submit" variant="outline" size="sm">Pause</Button>
                </form>
              ) : (
                <form action={resumeCampaign}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <Button type="submit" variant="primary" size="sm">Resume</Button>
                </form>
              )}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "accent" | "warning" }) {
  return (
    <Card>
      <CardBody>
        <div className="text-xs uppercase tracking-wide text-(--color-muted-foreground)">{label}</div>
        <div className={"mt-1 text-2xl font-semibold " + (accent === "accent" ? "text-(--color-accent)" : accent === "warning" ? "text-(--color-warning)" : "")}>
          {value}
        </div>
      </CardBody>
    </Card>
  );
}

