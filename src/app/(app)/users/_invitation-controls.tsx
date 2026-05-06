"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { Copy, Mail, RefreshCw, Trash2, X, Check } from "lucide-react";
import { resendInvitation, revokeInvitation } from "./actions";

interface Props {
  invitationId: string;
  email: string;
}

export function InvitationControls({ invitationId, email }: Props) {
  const [busy, setBusy] = React.useState<"resend" | "revoke" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ inviteLink: string; emailed: boolean } | null>(null);

  async function onResend() {
    setError(null);
    setBusy("resend");
    try {
      const fd = new FormData();
      fd.set("id", invitationId);
      const r = await resendInvitation(fd);
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onRevoke() {
    if (!confirm(`Revoke the invitation to ${email}? The link will stop working immediately.`)) return;
    setError(null);
    setBusy("revoke");
    try {
      const fd = new FormData();
      fd.set("id", invitationId);
      await revokeInvitation(fd);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onResend}
          disabled={busy !== null}
        >
          <RefreshCw className={"h-3.5 w-3.5 " + (busy === "resend" ? "animate-spin" : "")} />
          {busy === "resend" ? "Resending…" : "Resend"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRevoke}
          disabled={busy !== null}
          aria-label="Revoke invitation"
          title="Revoke invitation"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {error ? (
        <div className="mt-2 rounded-[8px] border border-(--color-danger)/40 bg-(--color-danger)/10 px-3 py-2 text-xs text-(--color-danger) flex items-center justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {result ? <ResendResultBanner result={result} email={email} onDismiss={() => setResult(null)} /> : null}
    </>
  );
}

function ResendResultBanner({
  result,
  email,
  onDismiss,
}: {
  result: { inviteLink: string; emailed: boolean };
  email: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="mt-2 rounded-[8px] border border-(--color-accent)/40 bg-(--color-accent)/10 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="font-medium">
          {result.emailed ? (
            <><Mail className="inline h-3.5 w-3.5 mr-1" /> New link emailed to {email}</>
          ) : (
            <>New link generated (SendGrid not configured — copy and send manually)</>
          )}
        </span>
        <button onClick={onDismiss} aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="flex items-center gap-1.5">
        <Input value={result.inviteLink} readOnly className="text-[11px]" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(result.inviteLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
