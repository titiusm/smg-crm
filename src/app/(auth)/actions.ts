"use server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/auth";
import { sendTransactionalEmail } from "@/lib/sendgrid";
import { recordAudit } from "@/lib/audit";

const RESET_TTL_MS = 60 * 60 * 1000; // 60 minutes

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function appUrl(): string {
  return (process.env.APP_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

const requestSchema = z.object({
  email: z.string().email(),
});

/**
 * "Forgot password" — issues a reset token and emails the recipient if the email matches a user.
 * Always returns the same success message regardless of whether the email exists, so we don't
 * leak which addresses are registered.
 */
export async function requestPasswordReset(formData: FormData): Promise<{ ok: true }> {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    // Even on bad input, don't surface details — just say "ok"
    return { ok: true };
  }
  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  if (user && user.isActive) {
    // Invalidate any prior unused tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    const link = `${appUrl()}/reset-password?token=${token}`;
    const html = `
<p>Hi ${escapeHtml(user.firstName)},</p>
<p>Someone requested a password reset for your SMG CRM account. If that was you, click the link below to set a new password. The link expires in 60 minutes.</p>
<p style="margin: 24px 0;">
  <a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;">Reset password</a>
</p>
<p style="font-size:12px;color:#64748b;">Or copy this URL into your browser:<br/><span style="word-break:break-all;">${link}</span></p>
<p style="font-size:12px;color:#64748b;">If you didn't request this, you can ignore this email — your password won't change.</p>`;

    const send = await sendTransactionalEmail({
      to: user.email,
      subject: "Reset your SMG CRM password",
      html,
      categories: ["password-reset"],
    });
    if ("error" in send) {
      // Surface in server logs but not to the client (no info leak about deliverability)
      console.error("[password-reset] SendGrid error:", send.error);
    }
  }

  return { ok: true };
}

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Consume a reset token + set a new password.
 * Single-use: token is marked used immediately on success.
 */
export async function resetPassword(formData: FormData): Promise<void> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { token, password } = parsed.data;
  const tokenHash = hashToken(token);

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!row) throw new Error("This reset link is invalid.");
  if (row.usedAt) throw new Error("This reset link has already been used.");
  if (row.expiresAt < new Date()) throw new Error("This reset link has expired. Request a new one.");
  if (!row.user.isActive) throw new Error("This account is deactivated.");

  const hashedPassword = await bcrypt.hash(password, 10);

  // Atomically mark the token used + update the password.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { hashedPassword },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    // Burn any other outstanding reset tokens for this user.
    prisma.passwordResetToken.deleteMany({
      where: { userId: row.userId, usedAt: null, id: { not: row.id } },
    }),
  ]);
}

const changeOwnSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

/** In-app password change — requires the current password as a sanity check. */
export async function changeOwnPassword(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = changeOwnSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.hashedPassword) throw new Error("Account not found.");
  const ok = await bcrypt.compare(currentPassword, user.hashedPassword);
  if (!ok) throw new Error("Current password is incorrect.");

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { hashedPassword },
  });

  await recordAudit({
    userId: user.id,
    actionType: "ROLE_CHANGE", // closest existing audit action — semantically "credential change"
    entityType: "USER",
    entityId: user.id,
    reason: "User changed own password",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
