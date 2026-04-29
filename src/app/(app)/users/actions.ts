"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/auth";
import { recordAudit } from "@/lib/audit";
import type { Role } from "@prisma/client";

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

  // Issue an invitation token (store only the hash)
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

  await prisma.invitation.create({
    data: {
      email: email.toLowerCase(),
      tokenHash,
      role: role as Role,
      createdByUserId: session.user.id,
      expiresAt,
    },
  });

  await recordAudit({
    userId: session.user.id,
    actionType: "USER_INVITED",
    entityType: "USER",
    entityId: user.id,
    newValue: { email: user.email, role: user.role },
  });

  // SendGrid integration arrives in Phase 1C. For now, surface the link so the owner
  // can send it manually. The link includes the raw token (hash stored in DB).
  const base = process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";
  const link = `${base}/accept-invite?token=${token}`;
  // Stash the last-issued link in an in-memory-ish place for the UI to show it.
  revalidatePath("/users");
  return { inviteLink: link };
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
