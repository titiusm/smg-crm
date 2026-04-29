// Public (unauthenticated) unsubscribe page — resolves the token, flips DNC.
import { prisma } from "@/lib/prisma";
import { Card, CardBody } from "@/components/ui/primitives";
import { CheckCircle2, XCircle } from "lucide-react";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) return <Shell success={false} message="Missing token." />;

  const row = await prisma.unsubscribeToken.findUnique({
    where: { token },
    include: { contact: { include: { company: true } } },
  });
  if (!row) return <Shell success={false} message="Invalid or expired unsubscribe link." />;

  if (!row.contact.doNotEmail) {
    await prisma.contact.update({
      where: { id: row.contactId },
      data: { doNotEmail: true, unsubscribedAt: new Date() },
    });
  }

  return (
    <Shell
      success
      message={`You've been unsubscribed, ${row.contact.firstName}. We won't send you any more email.`}
    />
  );
}

function Shell({ success, message }: { success: boolean; message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-background) px-4">
      <Card className="w-full max-w-md">
        <CardBody className="space-y-4 text-center">
          {success ? (
            <CheckCircle2 className="h-10 w-10 text-(--color-success) mx-auto" />
          ) : (
            <XCircle className="h-10 w-10 text-(--color-danger) mx-auto" />
          )}
          <h1 className="text-lg font-semibold">{success ? "Unsubscribed" : "Something went wrong"}</h1>
          <p className="text-sm text-(--color-muted-foreground)">{message}</p>
        </CardBody>
      </Card>
    </div>
  );
}
