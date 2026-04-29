"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole } from "@/auth";
import { runAllScanners } from "@/lib/scanners";

export async function markNotificationRead(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const notif = await prisma.notification.findUnique({ where: { id } });
  if (!notif || notif.userId !== session.user.id) throw new Error("Not found");
  await prisma.notification.update({ where: { id }, data: { isRead: true } });
  revalidatePath("/notifications");
}

export async function markAllRead() {
  const session = await requireSession();
  await prisma.notification.updateMany({
    where: { userId: session.user.id, isRead: false },
    data: { isRead: true },
  });
  revalidatePath("/notifications");
}

export async function triggerScan() {
  await requireRole(["OWNER"]);
  await runAllScanners();
  revalidatePath("/notifications");
}

export async function updatePreferences(formData: FormData) {
  const session = await requireSession();
  const prefs = {
    repActivity: String(formData.get("repActivity") ?? "weekly"),
    dealUpdates: String(formData.get("dealUpdates") ?? "daily"),
    campaignStats: String(formData.get("campaignStats") ?? "weekly"),
    followUpReminders: String(formData.get("followUpReminders") ?? "daily"),
    commissionUpdates: String(formData.get("commissionUpdates") ?? "daily"),
    approvalRequests: String(formData.get("approvalRequests") ?? "daily"),
    dormantCompanies: String(formData.get("dormantCompanies") ?? "weekly"),
    inAppAll: formData.get("inAppAll") === "on" || formData.get("inAppAll") === "true",
  };
  await prisma.notificationPreference.upsert({
    where: { userId: session.user.id },
    update: prefs,
    create: { userId: session.user.id, ...prefs },
  });
  revalidatePath("/notifications");
}
