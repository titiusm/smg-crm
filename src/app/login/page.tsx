import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Input, Label } from "@/components/ui/primitives";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");
  const { callbackUrl, error } = await searchParams;

  async function handleLogin(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").toLowerCase().trim();
    const password = String(formData.get("password") ?? "");
    const cb = String(formData.get("callbackUrl") ?? "/dashboard");
    await signIn("credentials", { email, password, redirectTo: cb });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-background) px-4">
      <Card className="w-full max-w-sm">
        <CardBody className="space-y-4">
          <div className="flex flex-col items-center gap-2">
            <div className="h-10 w-10 rounded-[10px] bg-(--color-accent) flex items-center justify-center text-(--color-accent-foreground) font-bold">
              SMG
            </div>
            <h1 className="text-lg font-semibold">Sign in to SMG CRM</h1>
            <p className="text-xs text-(--color-muted-foreground)">
              The Solar Maintenance Guys — Sales &amp; Relationships
            </p>
          </div>
          <form action={handleLogin} className="space-y-3">
            <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/dashboard"} />
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {error ? (
              <p className="text-xs text-(--color-danger)">Invalid email or password.</p>
            ) : null}
            <Button type="submit" className="w-full">Sign in</Button>
          </form>
          <p className="text-center text-[11px] text-(--color-muted-foreground)">
            Accounts are created by the Owner. Need access? Ask Titius.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
