import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardBody, Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { resetPassword } from "@/app/(auth)/actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  if (!token) redirect("/login");

  async function handleSubmit(formData: FormData) {
    "use server";
    try {
      await resetPassword(formData);
    } catch (e) {
      const msg = encodeURIComponent((e as Error).message);
      redirect(`/reset-password?token=${token}&error=${msg}`);
    }
    redirect("/login?reset=1");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-background) px-4">
      <Card className="w-full max-w-sm">
        <CardBody className="space-y-4">
          <div className="flex flex-col items-center gap-2">
            <div className="h-10 w-10 rounded-[10px] bg-(--color-accent) flex items-center justify-center text-(--color-accent-foreground) font-bold">
              SMG
            </div>
            <h1 className="text-lg font-semibold">Set a new password</h1>
            <p className="text-xs text-(--color-muted-foreground) text-center">
              Pick something at least 8 characters long.
            </p>
          </div>
          <form action={handleSubmit} className="space-y-3">
            <input type="hidden" name="token" value={token} />
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required />
            </div>
            {error ? (
              <p className="text-xs text-(--color-danger)">{decodeURIComponent(error)}</p>
            ) : null}
            <Button type="submit" className="w-full">Set password &amp; sign in</Button>
          </form>
          <p className="text-center text-[11px] text-(--color-muted-foreground)">
            <Link href="/login" className="hover:text-(--color-foreground)">← Back to sign in</Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
