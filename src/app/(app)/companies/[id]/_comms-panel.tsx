"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea, Input, Label } from "@/components/ui/primitives";
import { Phone, Mail, MessageSquare, Ban, X } from "lucide-react";
import { initiateCall, sendText, sendEmailNow } from "./comms/actions";

interface Contact {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phoneNumber: string | null;
  doNotCall: boolean;
  doNotEmail: boolean;
  doNotText: boolean;
}

export function CommsButtons({
  companyId,
  primaryContact,
  companyFlags,
  canCallText,
  canEmail,
}: {
  companyId: string;
  primaryContact: Contact | null;
  companyFlags: { doNotCall: boolean; doNotEmail: boolean; doNotText: boolean; hasPhone: boolean; hasEmail: boolean };
  canCallText: boolean;
  canEmail: boolean;
}) {
  const [open, setOpen] = React.useState<"sms" | "email" | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function handle(action: "call" | "sms" | "email", fd: FormData) {
    setErr(null);
    setPending(true);
    try {
      if (action === "call") await initiateCall(fd);
      if (action === "sms") { await sendText(fd); setOpen(null); }
      if (action === "email") { await sendEmailNow(fd); setOpen(null); }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  const callReason =
    !canCallText ? "Your account needs a Twilio number + personal forwarding phone before you can call."
    : companyFlags.doNotCall ? "This company is flagged Do Not Call."
    : !companyFlags.hasPhone ? "No phone on file."
    : undefined;
  const textReason =
    !canCallText ? "Your account needs a Twilio number before you can text."
    : companyFlags.doNotText ? "This company is flagged Do Not Text."
    : !companyFlags.hasPhone ? "No phone on file."
    : undefined;
  const emailReason =
    !canEmail ? "SendGrid is not configured yet (set SENDGRID_API_KEY)."
    : companyFlags.doNotEmail ? "This company is flagged Do Not Email."
    : !companyFlags.hasEmail && !primaryContact?.email ? "No email on file."
    : undefined;

  return (
    <>
      <form
        action={async (fd) => {
          fd.set("companyId", companyId);
          if (primaryContact) fd.set("contactId", primaryContact.id);
          await handle("call", fd);
        }}
      >
        <Button variant="outline" size="sm" type="submit" disabled={!!callReason || pending} title={callReason ?? "Call"}>
          <Phone className="h-4 w-4" /> Call
          {callReason ? <Ban className="h-3 w-3 ml-1 opacity-60" /> : null}
        </Button>
      </form>

      <Button variant="outline" size="sm" type="button" disabled={!!textReason} title={textReason ?? "Text"} onClick={() => setOpen("sms")}>
        <MessageSquare className="h-4 w-4" /> Text
        {textReason ? <Ban className="h-3 w-3 ml-1 opacity-60" /> : null}
      </Button>

      <Button variant="outline" size="sm" type="button" disabled={!!emailReason} title={emailReason ?? "Email"} onClick={() => setOpen("email")}>
        <Mail className="h-4 w-4" /> Email
        {emailReason ? <Ban className="h-3 w-3 ml-1 opacity-60" /> : null}
      </Button>

      {open === "sms" ? (
        <Modal title="Send text message" onClose={() => setOpen(null)} error={err}>
          <form
            action={async (fd) => {
              fd.set("companyId", companyId);
              if (primaryContact) fd.set("contactId", primaryContact.id);
              await handle("sms", fd);
            }}
            className="space-y-3"
          >
            <div className="text-xs text-(--color-muted-foreground)">
              To: {primaryContact?.phoneNumber ?? "(company phone)"}
            </div>
            <Textarea name="body" rows={4} placeholder="Your message" required maxLength={1600} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send"}</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {open === "email" ? (
        <Modal title="Send email" onClose={() => setOpen(null)} error={err}>
          <form
            action={async (fd) => {
              fd.set("companyId", companyId);
              await handle("email", fd);
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label>To (contact)</Label>
              <Input
                name="contactId"
                defaultValue={primaryContact?.id ?? ""}
                placeholder="contact id"
                readOnly
                className="text-xs"
              />
              <div className="text-[11px] text-(--color-muted-foreground)">
                Sending to: {primaryContact?.email ?? "—"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input name="subject" placeholder="Hi {{contact_first_name}}, quick question…" required />
            </div>
            <div className="space-y-1.5">
              <Label>Body (HTML — merge fields: {'{{company_name}}, {{contact_first_name}}, {{rep_name}}'})</Label>
              <Textarea
                name="body"
                rows={10}
                placeholder={"Hi {{contact_first_name}},\n\nI wanted to follow up…"}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send email"}</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

function Modal({ title, onClose, error, children }: { title: string; onClose: () => void; error: string | null; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-[14px] border border-(--color-border) bg-(--color-card) shadow-xl">
        <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-5">
          {error ? <div className="mb-3 rounded-[8px] border border-(--color-danger)/40 bg-(--color-danger)/10 px-3 py-2 text-xs text-(--color-danger)">{error}</div> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
