import { redirect } from "next/navigation";
import { acceptInvitation } from "@/app/(app)/users/actions";
import { Card, CardBody, CardHeader, CardTitle, Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  if (!token) redirect("/login");

  async function onSubmit(formData: FormData) {
    "use server";
    try {
      await acceptInvitation(formData);
    } catch (e) {
      redirect(`/accept-invite?token=${token}&error=${encodeURIComponent((e as Error).message)}`);
    }
    redirect("/login?accepted=1");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-background) px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Accept invitation</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={onSubmit} className="space-y-3">
            <input type="hidden" name="token" value={token} />
            <div className="space-y-1.5">
              <Label>Choose a password</Label>
              <Input type="password" name="password" minLength={8} required />
              <p className="text-[11px] text-(--color-muted-foreground)">
                At least 8 characters.
              </p>
            </div>
            {error ? <p className="text-xs text-(--color-danger)">{decodeURIComponent(error)}</p> : null}
            <Button type="submit" className="w-full">Set password &amp; continue</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
