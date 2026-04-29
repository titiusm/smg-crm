import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Badge, Label, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { markAllRead, markNotificationRead, triggerScan, updatePreferences } from "./actions";
import { Bell } from "lucide-react";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session) return null;

  const [notifications, prefs] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.notificationPreference.findUnique({ where: { userId: session.user.id } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Bell className="h-5 w-5" /> Notifications
          </h1>
          <p className="text-sm text-(--color-muted-foreground)">
            Follow-up reminders, dormant-company alerts, approval requests, and rep-inactive flags.
          </p>
        </div>
        <div className="flex gap-2">
          {session.user.role === "OWNER" ? (
            <form action={triggerScan}>
              <Button type="submit" variant="outline" size="sm">Run scan now</Button>
            </form>
          ) : null}
          <form action={markAllRead}>
            <Button type="submit" variant="outline" size="sm">Mark all read</Button>
          </form>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent</CardTitle></CardHeader>
        <CardBody className="p-0">
          {notifications.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-(--color-muted-foreground)">
              You&apos;re caught up.
              {session.user.role === "OWNER" ? " Click \"Run scan now\" to check for dormant companies, follow-ups, and high-value prospects." : ""}
            </div>
          ) : (
            <ul className="divide-y divide-(--color-border)">
              {notifications.map((n) => (
                <li key={n.id} className={"px-5 py-3 text-sm " + (n.isRead ? "opacity-60" : "")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={n.isRead ? "muted" : typeForBadge(n.notificationType)}>
                          {labelFor(n.notificationType)}
                        </Badge>
                        <span className="font-medium truncate">{n.title}</span>
                      </div>
                      <p className="mt-1 text-(--color-muted-foreground)">{n.message}</p>
                      <div className="mt-1 text-[11px] text-(--color-muted-foreground)">
                        {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {n.relatedEntityType === "COMPANY" && n.relatedEntityId ? (
                        <Link href={`/companies/${n.relatedEntityId}`}>
                          <Button variant="outline" size="sm">Open</Button>
                        </Link>
                      ) : n.relatedEntityType === "JOB" && n.relatedEntityId ? (
                        <Link href={`/jobs/${n.relatedEntityId}`}>
                          <Button variant="outline" size="sm">Open</Button>
                        </Link>
                      ) : null}
                      {!n.isRead ? (
                        <form action={markNotificationRead}>
                          <input type="hidden" name="id" value={n.id} />
                          <Button variant="ghost" size="sm" type="submit">Mark read</Button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Email summary preferences</CardTitle></CardHeader>
        <CardBody>
          <p className="text-xs text-(--color-muted-foreground) mb-3">
            Toggle what ends up in your email digest (SendGrid sending arrives in Phase 1C — the preferences save now and take effect once email is wired up).
          </p>
          <form action={updatePreferences} className="grid gap-3 md:grid-cols-2">
            <PrefRow name="repActivity" label="Rep activity summary" current={prefs?.repActivity} />
            <PrefRow name="dealUpdates" label="Deal updates" current={prefs?.dealUpdates} />
            <PrefRow name="campaignStats" label="Campaign stats" current={prefs?.campaignStats} />
            <PrefRow name="followUpReminders" label="Follow-up reminders" current={prefs?.followUpReminders} />
            <PrefRow name="commissionUpdates" label="Commission updates" current={prefs?.commissionUpdates} />
            <PrefRow name="approvalRequests" label="Approval requests" current={prefs?.approvalRequests} />
            <PrefRow name="dormantCompanies" label="Dormant company alerts" current={prefs?.dormantCompanies} />
            <label className="flex items-center gap-2 text-sm self-end md:col-span-2">
              <input type="checkbox" name="inAppAll" defaultChecked={prefs?.inAppAll ?? true} />
              Show in-app notifications
            </label>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" size="sm">Save preferences</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

function PrefRow({ name, label, current }: { name: string; label: string; current: string | undefined | null }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label>{label}</Label>
      <Select name={name} defaultValue={current ?? "off"} className="w-36">
        <option value="off">Off</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
      </Select>
    </div>
  );
}

function typeForBadge(t: string): "accent" | "warning" | "danger" | "muted" {
  if (t === "APPROVAL_NEEDED" || t === "BACKWARD_STATUS_CHANGE") return "danger";
  if (t === "DORMANT_COMPANY" || t === "REP_INACTIVE") return "warning";
  return "accent";
}

function labelFor(t: string): string {
  return t.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}
