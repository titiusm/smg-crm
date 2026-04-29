"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/auth";
import { recordAudit } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

const EDITABLE_STRING_KEYS = [
  "company_logo_path",
  "license_number",
  "default_email_from_name",
  "default_email_from_email",
  "estimate_terms_text",
  "company_physical_address",
] as const;

const EDITABLE_NUMBER_KEYS = [
  "daily_campaign_sending_limit",
  "follow_up_interval_days",
  "dormant_threshold_days",
  "rep_inactive_threshold_days",
  "high_value_review_threshold",
] as const;

const EDITABLE_BOOL_KEYS = ["two_party_consent_required"] as const;

export async function updateSettings(formData: FormData) {
  const session = await requireRole(["OWNER"]);

  for (const key of EDITABLE_STRING_KEYS) {
    const v = formData.get(key);
    if (v === null) continue;
    await upsertAndLog(session.user.id, key, String(v));
  }
  for (const key of EDITABLE_NUMBER_KEYS) {
    const v = formData.get(key);
    if (v === null) continue;
    const n = Number(v) || 0;
    await upsertAndLog(session.user.id, key, n);
  }
  for (const key of EDITABLE_BOOL_KEYS) {
    const v = formData.get(key);
    await upsertAndLog(session.user.id, key, v === "on" || v === "true");
  }

  revalidatePath("/settings");
}

async function upsertAndLog(userId: string, key: string, value: unknown) {
  const existing = await prisma.globalSetting.findUnique({ where: { key } });
  if (existing && JSON.stringify(existing.value) === JSON.stringify(value)) return;
  await prisma.globalSetting.upsert({
    where: { key },
    update: { value: value as Prisma.InputJsonValue, updatedBy: userId },
    create: { key, value: value as Prisma.InputJsonValue, updatedBy: userId },
  });
  await recordAudit({
    userId,
    actionType: "GLOBAL_SETTING_CHANGED",
    entityType: "GLOBAL_SETTING",
    entityId: key,
    oldValue: existing?.value,
    newValue: value,
  });
}

export async function updateLineItem(formData: FormData) {
  const session = await requireRole(["OWNER", "LIMITED_ADMIN"]);
  const id = String(formData.get("id") ?? "");
  const defaultUnitPrice = Number(formData.get("defaultUnitPrice") ?? 0);
  const unitType = String(formData.get("unitType") ?? "").trim();
  const isActive = formData.get("isActive") === "on";
  await prisma.lineItemMenu.update({
    where: { id },
    data: { defaultUnitPrice, unitType, isActive },
  });
  await recordAudit({
    userId: session.user.id,
    actionType: "GLOBAL_SETTING_CHANGED",
    entityType: "GLOBAL_SETTING",
    entityId: `line_item:${id}`,
    newValue: { defaultUnitPrice, unitType, isActive },
  });
  revalidatePath("/settings");
}
