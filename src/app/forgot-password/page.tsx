import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Card, CardBody, Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "@/app/(auth)/actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");
  const { sent } = await searchParams;

  async function handleSubmit(formData: FormData) {
    "use server";
    await requestPasswordReset(formData);
    redirect("/forgot-password?sent=1");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-background) px-4">
      <Card className="w-full max-w-sm">
        <CardBody className="space-y-4">
          <div className="flex flex-col items-center gap-2">
            <div className="h-10 w-10 rounded-[10px] bg-(--color-accent) flex items-center justify-center text-(--color-accent-foreground) font-bold">
              SMG
            </div>
            <h1 className="text-lg font-semibold">Forgot your password?</h1>
            <p className="text-xs text-(--color-muted-foreground) text-center">
              Enter your email and we&apos;ll send you a link to reset it.
            </p>
          </div>
          {sent ? (
            <div className="rounded-[10px] border border-(--color-success)/40 bg-(--color-success)/10 p-3 text-sm text-(--color-success)">
              If that email matches an account, a reset link is on the way. Check your inbox (and spam) — the link expires in 60 minutes.
            </div>
          ) : (
            <form action={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <Button type="submit" className="w-full">Send reset link</Button>
            </form>
          )}
          <p className="text-center text-[11px] text-(--color-muted-foreground)">
            <Link href="/login" className="hover:text-(--color-foreground)">← Back to sign in</Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
