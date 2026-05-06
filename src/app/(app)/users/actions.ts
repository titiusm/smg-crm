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
import type { Prisma, Role } from "@prisma/client";

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
