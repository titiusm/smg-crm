"use client";
import Link from "next/link";
import { useState } from "react";
import { inviteUser } from "../actions";
import { Card, CardBody, CardHeader, CardTitle, Input, Label, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/rbac";
import { Copy } from "lucide-react";

export default function NewUserPage() {
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setError(null);
    try {
      const r = await inviteUser(formData);
      if (r?.inviteLink) setInviteLink(r.inviteLink);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/users" className="text-xs text-(--color-muted-foreground) hover:text-(--color-foreground)">
        ← Back to users
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Invite user</h1>

      <Card>
        <CardHeader><CardTitle>Invitation details</CardTitle></CardHeader>
        <CardBody>
          <form action={onSubmit} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input name="firstName" required />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input name="lastName" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input name="email" type="email" required />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select name="role" defaultValue="SALES_REP">
                <option value="SALES_REP">{ROLE_LABELS.SALES_REP}</option>
                <option value="LIMITED_ADMIN">{ROLE_LABELS.LIMITED_ADMIN}</option>
                <option value="OWNER">{ROLE_LABELS.OWNER}</option>
              </Select>
            </div>
            {error ? <p className="text-xs text-(--color-danger)">{error}</p> : null}
            <div className="flex justify-end gap-2 pt-2">
              <Link href="/users"><Button variant="outline" type="button">Cancel</Button></Link>
              <Button type="submit">Generate invite link</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {inviteLink ? (
        <Card>
          <CardHeader><CardTitle>Invitation link ready</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-(--color-muted-foreground)">
              Send this link to the new user. It&apos;s valid for 7 days. In Phase 1C, this will
              be emailed automatically via SendGrid.
            </p>
            <div className="flex items-center gap-2">
              <Input value={inviteLink} readOnly />
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink);
                }}
              >
                <Copy className="h-4 w-4" /> Copy
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
