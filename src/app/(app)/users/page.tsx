import Link from "next/link";
import { requireRole } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/rbac";
import { describeStructure, parseStructure } from "@/lib/commission";
import { CommissionEditor } from "./_commission-editor";
import { InvitationControls } from "./_invitation-controls";
import { format } from "date-fns";

export default async function UsersPage() {
  await requireRole(["OWNER"]);
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  // Include expired invites too so the admin can resend them. Filter out accepted ones.
  const pendingInvites = await prisma.invitation.findMany({
    where: { acceptedAt: null },
    orderBy: { createdAt: "desc" },
    include: { createdBy: true },
  });
  const now = new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-(--color-muted-foreground)">
            Invite reps and manage roles. Role changes are logged in the audit trail.
          </p>
        </div>
        <Link href="/users/new"><Button>Invite user</Button></Link>
      </div>

      <Card>
        <CardHeader><CardTitle>Team</CardTitle></CardHeader>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-(--color-border) bg-(--color-muted)/40">
              <tr className="text-left text-xs uppercase tracking-wide text-(--color-muted-foreground)">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Commission</th>
                <th className="px-4 py-2">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {users.map((u) => {
                const structure = parseStructure(u.commissionStructure);
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-2 font-medium">{u.firstName} {u.lastName}</td>
                    <td className="px-4 py-2 text-xs">{u.email}</td>
                    <td className="px-4 py-2"><Badge variant="muted">{ROLE_LABELS[u.role]}</Badge></td>
                    <td className="px-4 py-2">
                      {u.isActive ? (
                        u.hashedPassword ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="warning">Pending invite</Badge>
                        )
                      ) : (
                        <Badge variant="muted">Deactivated</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-(--color-muted-foreground) max-w-[180px] truncate" title={describeStructure(structure)}>
                          {describeStructure(structure)}
                        </span>
                        <CommissionEditor
                          userId={u.id}
                          userName={`${u.firstName} ${u.lastName}`}
                          current={structure}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-(--color-muted-foreground)">
                      {format(u.createdAt, "MMM d, yyyy")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pending invitations</CardTitle></CardHeader>
        <CardBody className="p-0">
          {pendingInvites.length === 0 ? (
            <div className="px-5 py-6 text-center text-xs text-(--color-muted-foreground)">
              No pending invitations.
            </div>
          ) : (
            <ul className="divide-y divide-(--color-border) text-sm">
              {pendingInvites.map((i) => {
                const expired = i.expiresAt <= now;
                return (
                  <li key={i.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{i.email}</div>
                        <div className="text-[11px] text-(--color-muted-foreground)">
                          {ROLE_LABELS[i.role]} · invited by {i.createdBy.firstName} {i.createdBy.lastName} ·
                          {expired ? " expired" : " expires"} {format(i.expiresAt, "MMM d, yyyy")}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={expired ? "danger" : "warning"}>
                          {expired ? "Expired" : "Pending"}
                        </Badge>
                        <InvitationControls invitationId={i.id} email={i.email} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
