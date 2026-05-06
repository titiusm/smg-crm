"use client";
import * as React from "react";
import { Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { changeOwnPassword } from "@/app/(auth)/actions";

export function ChangePasswordForm() {
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    setPending(true);
    try {
      await changeOwnPassword(formData);
      setSuccess(true);
      // Clear form fields by resetting the form (caller's effect)
      const f = document.querySelector<HTMLFormElement>("#change-pw-form");
      f?.reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form id="change-pw-form" action={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="newPassword">New password</Label>
        <Input id="newPassword" name="newPassword" type="password" minLength={8} autoComplete="new-password" required />
        <p className="text-[11px] text-(--color-muted-foreground)">At least 8 characters.</p>
      </div>
      {error ? (
        <div className="rounded-[8px] border border-(--color-danger)/40 bg-(--color-danger)/10 px-3 py-2 text-xs text-(--color-danger)">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-[8px] border border-(--color-success)/40 bg-(--color-success)/10 px-3 py-2 text-xs text-(--color-success)">
          Password updated.
        </div>
      ) : null}
      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Update password"}</Button>
      </div>
    </form>
  );
}
