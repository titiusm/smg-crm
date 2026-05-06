import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { ROLE_LABELS } from "@/lib/rbac";
import { ChangePasswordForm } from "./_change-password-form";
import { format } from "date-fns";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="text-sm text-(--color-muted-foreground)">
          Account details and credentials.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardBody className="space-y-3 text-sm">
          <Row label="Name" value={`${user.firstName} ${user.lastName}`} />
          <Row label="Email" value={user.email} />
          <Row label="Role" value={ROLE_LABELS[user.role]} />
          {user.twilioPhoneNumber ? (
            <Row label="Twilio number" value={user.twilioPhoneNumber} />
          ) : null}
          {user.phone ? (
            <Row label="Forwarding phone" value={user.phone} />
          ) : null}
          <Row label="Member since" value={format(user.createdAt, "MMM d, yyyy")} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
        <CardBody>
          <ChangePasswordForm />
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-(--color-border)/50 last:border-b-0 py-2">
      <span className="text-xs uppercase tracking-wide text-(--color-muted-foreground)">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

