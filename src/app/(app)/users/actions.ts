"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/auth";
import { recordAudit } from "@/lib/audit";
import { parseStructure, type CommissionStructure } from "@/lib/commission";
import { recomputeAllJobCommissionsForRep } from "@/app/(app)/jobs/actions";
import { sendTransactionalEmail, sendgridConfigured } from "@/lib/sendgrid";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Prisma, Role } from "@prisma/client";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function appBaseUrl(): string {
  return (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Builds + persists a fresh invitation row for a user. Returns the raw token + link. */
async function issueInvitationToken(opts: {
  email: string;
  role: Role;
  createdByUserId: string;
}): Promise<{ token: string; link: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  await prisma.invitation.create({
    data: {
      email: opts.email.toLowerCase(),
      tokenHash,
      role: opts.role,
      createdByUserId: opts.createdByUserId,
      expiresAt,
    },
  });

  return { token, link: `${appBaseUrl()}/accept-invite?token=${token}`, expiresAt };
}

/** Send the invite email via SendGrid. Returns true on send, false if SendGrid isn't configured. */
async function sendInvitationEmail(opts: {
  to: string;
  recipientName: string;
  role: Role;
  inviteLink: string;
  inviterName: string;
}): Promise<boolean> {
  if (!sendgridConfigured()) return false;
  const html = `
<p>Hi ${escapeHtml(opts.recipientName)},</p>
<p>${escapeHtml(opts.inviterName)} invited you to The Solar Maintenance Guys CRM as a <strong>${escapeHtml(ROLE_LABELS[opts.role])}</strong>. Click below to set your password and sign in. The link expires in 7 days.</p>
<p style="margin: 24px 0;">
  <a href="${opts.inviteLink}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;">Accept invitation</a>
</p>
<p style="font-size:12px;color:#64748b;">Or copy this URL into your browser:<br/><span style="word-break:break-all;">${opts.inviteLink}</span></p>
<p style="font-size:12px;color:#64748b;">If you weren't expecting this, you can ignore the email.</p>`;

  const result = await sendTransactionalEmail({
    to: opts.to,
    subject: "You're invited to SMG CRM",
    html,
    categories: ["invitation"],
  });
  if ("error" in result) {
    console.error("[invitation email] SendGrid error:", result.error);
    return false;
  }
  return true;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const inviteSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["OWNER", "LIMITED_ADMIN", "SALES_REP", "REGIONAL_MANAGER"]),
});

export async function inviteUser(formData: FormData) {
  const session = await requireRole(["OWNER"]);
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  const { firstName, lastName, email, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw new Error("A user with that email already exists");

  // Create the user WITHOUT a password; they set it via the accept-invite flow.
  const user = await prisma.user.create({
    data: {
      firstName,
      lastName,
      email: email.toLowerCase(),
      role: role as Role,
      isActive: true,
      hashedPassword: null,
    },
  });

  const { link } = await issueInvitationToken({
    email: user.email,
    role: role as Role,
    createdByUserId: session.user.id,
  });

  await recordAudit({
    userId: session.user.id,
    actionType: "USER_INVITED",
    entityType: "USER",
    entityId: user.id,
    newValue: { email: user.email, role: user.role },
  });

  // Auto-send via SendGrid if configured. The owner still gets the link back so they can
  // copy/paste it manually if email delivery is delayed.
  const inviter = await prisma.user.findUnique({ where: { id: session.user.id } });
  const emailed = await sendInvitationEmail({
    to: user.email,
    recipientName: user.firstName,
    role: user.role,
    inviteLink: link,
    inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : "the team",
  });

  revalidatePath("/users");
  return { inviteLink: link, emailed };
}

const invitationIdSchema = z.object({ id: z.string().min(1) });

/**
 * Owner-clicked "Resend invite" — issues a new token, invalidates any existing pending
 * invitations for the same email, and emails the new link.
 * Works even if the original invitation expired.
 */
export async function resendInvitation(formData: FormData): Promise<{ inviteLink: string; emailed: boolean }> {
  const session = await requireRole(["OWNER"]);
  const parsed = invitationIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error("Missing invitation id");
  const inv = await prisma.invitation.findUnique({ where: { id: parsed.data.id } });
  if (!inv) throw new Error("Invitation not found");
  if (inv.acceptedAt) throw new Error("That invitation has already been accepted.");

  // Find the corresponding user (created at original invite time)
  const user = await prisma.user.findUnique({ where: { email: inv.email } });
  if (!user) throw new Error("Linked user account is missing.");
  if (user.hashedPassword) throw new Error("That user has already set a password — no need to resend.");

  // Invalidate every outstanding (unaccepted) invitation for this email so old links can't be used.
  await prisma.invitation.deleteMany({
    where: { email: inv.email, acceptedAt: null },
  });

  const { link } = await issueInvitationToken({
    email: inv.email,
    role: inv.role,
    createdByUserId: session.user.id,
  });

  const inviter = await prisma.user.findUnique({ where: { id: session.user.id } });
  const emailed = await sendInvitationEmail({
    to: inv.email,
    recipientName: user.firstName,
    role: inv.role,
    inviteLink: link,
    inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : "the team",
  });

  await recordAudit({
    userId: session.user.id,
    actionType: "USER_INVITED",
    entityType: "USER",
    entityId: user.id,
    newValue: { email: inv.email, role: inv.role, resent: true, emailed },
    reason: "Resent invitation",
  });

  revalidatePath("/users");
  return { inviteLink: link, emailed };
}

/**
 * Owner-clicked "Revoke invite" — deletes the pending invitation and deactivates the
 * never-accepted user account so it doesn't sit around looking like an active user.
 */
export async function revokeInvitation(formData: FormData): Promise<void> {
  const session = await requireRole(["OWNER"]);
  const parsed = invitationIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error("Missing invitation id");
  const inv = await prisma.invitation.findUnique({ where: { id: parsed.data.id } });
  if (!inv) throw new Error("Invitation not found");
  if (inv.acceptedAt) throw new Error("That invitation has already been accepted; deactivate the user instead.");

  await prisma.invitation.deleteMany({
    where: { email: inv.email, acceptedAt: null },
  });

  // Deactivate the never-accepted user record (it has no password yet anyway).
  const user = await prisma.user.findUnique({ where: { email: inv.email } });
  if (user && !user.hashedPassword) {
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    await recordAudit({
      userId: session.user.id,
      actionType: "USER_DEACTIVATED",
      entityType: "USER",
      entityId: user.id,
      reason: "Invitation revoked before acceptance",
    });
  }

  revalidatePath("/users");
}

export async function deactivateUser(formData: FormData) {
  const session = await requireRole(["OWNER"]);
  const id = String(formData.get("id") ?? "");
  if (!id || id === session.user.id) throw new Error("Cannot deactivate yourself");
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new Error("Not found");

  await prisma.user.update({ where: { id }, data: { isActive: false } });
  await recordAudit({
    userId: session.user.id,
    actionType: "USER_DEACTIVATED",
    entityType: "USER",
    entityId: id,
    oldValue: { isActive: existing.isActive },
    newValue: { isActive: false },
  });
  revalidatePath("/users");
}

export async function setOutreachTargets(formData: FormData) {
  await requireRole(["OWNER"]);
  const id = String(formData.get("id") ?? "");
  const daily_calls = Number(formData.get("daily_calls") ?? 0) || 0;
  const daily_emails = Number(formData.get("daily_emails") ?? 0) || 0;
  const daily_texts = Number(formData.get("daily_texts") ?? 0) || 0;

  await prisma.user.update({
    where: { id },
    data: { outreachTargets: { daily_calls, daily_emails, daily_texts } },
  });
  revalidatePath("/users");
}

const acceptSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function acceptInvitation(formData: FormData) {
  const parsed = acceptSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  const { token, password } = parsed.data;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const inv = await prisma.invitation.findUnique({ where: { tokenHash } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) {
    throw new Error("Invitation is invalid or has expired");
  }
  const user = await prisma.user.findUnique({ where: { email: inv.email } });
  if (!user) throw new Error("User record not found — contact your admin.");

  const hashedPassword = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { hashedPassword, emailVerified: new Date() },
  });
  await prisma.invitation.update({
    where: { tokenHash },
    data: { acceptedAt: new Date() },
  });
}

// ----------------------------------------------------------------------------
// Commission structure editing (owner only)
// ----------------------------------------------------------------------------

const commissionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["flat_revenue", "flat_profit", "quarterly_revenue_tiers"]),
  // Flat structures: a single rate (percent, 0–100)
  ratePercent: z.coerce.number().min(0).max(100).optional(),
  // Tiers structure: base rate + serialized JSON tiers
  basePercent: z.coerce.number().min(0).max(100).optional(),
  tiersJson: z.string().optional(),
});

export async function updateUserCommission(formData: FormData) {
  const session = await requireRole(["OWNER"]);
  const parsed = commissionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  const { id, type } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new Error("User not found");
  const oldStructure = parseStructure(existing.commissionStructure);

  let newStructure: CommissionStructure;
  if (type === "flat_revenue" || type === "flat_profit") {
    if (parsed.data.ratePercent == null) throw new Error("Rate is required");
    newStructure = { type, rate: parsed.data.ratePercent / 100 };
  } else {
    // quarterly_revenue_tiers
    if (parsed.data.basePercent == null) throw new Error("Base rate is required");
    let tiers: { min: number; max: number | null; rate: number }[] = [];
    if (parsed.data.tiersJson) {
      try {
        const raw = JSON.parse(parsed.data.tiersJson) as Array<{
          min: number | string;
          max: number | string | null;
          rate: number | string;
        }>;
        tiers = raw.map((t) => ({
          min: Number(t.min) || 0,
          max: t.max === null || t.max === undefined || t.max === "" ? null : Number(t.max),
          rate: typeof t.rate === "number" ? t.rate : Number(t.rate) / 100,
        }));
      } catch {
        throw new Error("Tiers JSON is malformed");
      }
    }
    newStructure = {
      type: "quarterly_revenue_tiers",
      base_rate: parsed.data.basePercent / 100,
      tiers,
    };
  }

  await prisma.user.update({
    where: { id },
    data: { commissionStructure: newStructure as unknown as Prisma.InputJsonValue },
  });

  await recordAudit({
    userId: session.user.id,
    actionType: "COMMISSION_STRUCTURE_CHANGE",
    entityType: "USER",
    entityId: id,
    oldValue: oldStructure,
    newValue: newStructure,
  });

  // Recompute unlocked job commissions for this rep so existing jobs reflect the new rate.
  // (Locked / Paid jobs are preserved per spec §8.)
  await recomputeAllJobCommissionsForRep(id);

  revalidatePath("/users");
  revalidatePath(`/commission`);
}
