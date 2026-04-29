// SendGrid helpers — single email send, merge field rendering, unsubscribe injection.
import sgMail from "@sendgrid/mail";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) sgMail.setApiKey(apiKey);

export function sendgridConfigured(): boolean {
  return !!apiKey;
}

export function fromDefaults(): { name: string; email: string } {
  return {
    name: process.env.SENDGRID_FROM_NAME || "The Solar Maintenance Guys",
    email: process.env.SENDGRID_FROM_EMAIL || "",
  };
}

/** Lazily create or fetch the contact's unsubscribe token. */
export async function getOrCreateUnsubscribeToken(contactId: string): Promise<string> {
  const existing = await prisma.unsubscribeToken.findUnique({ where: { contactId } });
  if (existing) return existing.token;
  const token = randomBytes(18).toString("base64url");
  await prisma.unsubscribeToken.create({ data: { token, contactId } });
  return token;
}

/** Resolve merge fields {{company_name}}, {{contact_first_name}}, etc. */
export function renderTemplate(tpl: string, vars: Record<string, string | null | undefined>): string {
  return tpl.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key) => {
    const v = vars[key];
    return v != null ? String(v) : "";
  });
}

/** Inject unsubscribe link + physical address at the bottom (CAN-SPAM). */
export async function composeEmailBody(opts: {
  bodyHtml: string;
  contactId: string;
  physicalAddress: string;
}): Promise<{ html: string; text: string }> {
  const token = await getOrCreateUnsubscribeToken(opts.contactId);
  const appUrl = process.env.APP_URL || process.env.AUTH_URL || "";
  const unsubUrl = `${appUrl}/unsubscribe?token=${token}`;
  const footer = `
<hr style="margin: 24px 0 12px; border: none; border-top: 1px solid #e5e5e5;" />
<div style="font-size: 11px; color: #64748b; line-height: 1.5;">
  ${escapeHtml(opts.physicalAddress)}<br/>
  <a href="${unsubUrl}" style="color: #64748b;">Unsubscribe</a>
</div>`;
  const textFooter = `\n\n---\n${opts.physicalAddress}\nUnsubscribe: ${unsubUrl}`;

  const html = `${opts.bodyHtml}${footer}`;
  const text = stripHtml(opts.bodyHtml) + textFooter;
  return { html, text };
}

export async function sendIndividualEmail(opts: {
  to: string;
  subject: string;
  html: string;
  contactId: string;
  physicalAddress: string;
  categories?: string[];
  customArgs?: Record<string, string>;
}): Promise<{ messageId: string } | { error: string }> {
  if (!sendgridConfigured()) return { error: "SendGrid not configured (SENDGRID_API_KEY missing)." };
  const from = fromDefaults();
  if (!from.email) return { error: "SENDGRID_FROM_EMAIL not set." };

  const { html, text } = await composeEmailBody({
    bodyHtml: opts.html,
    contactId: opts.contactId,
    physicalAddress: opts.physicalAddress,
  });

  try {
    const [resp] = await sgMail.send({
      to: opts.to,
      from,
      subject: opts.subject,
      html,
      text,
      categories: opts.categories,
      customArgs: opts.customArgs,
      trackingSettings: {
        openTracking: { enable: true },
        clickTracking: { enable: true },
      },
    });
    const messageId = resp.headers["x-message-id"] as string | undefined;
    return { messageId: messageId ?? "" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
