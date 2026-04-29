"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/auth";
import { defaultOwnerLayout, defaultRepLayout, type LayoutItem, type WidgetInstance } from "@/lib/widgets";
import type { Prisma } from "@prisma/client";

async function getActiveLayoutId(userId: string): Promise<string | null> {
  const active = await prisma.dashboardLayout.findFirst({
    where: { userId, isDefault: true },
    orderBy: { updatedAt: "desc" },
  });
  return active?.id ?? null;
}

export async function saveLayout(formData: FormData) {
  const session = await requireSession();
  const layoutStr = String(formData.get("layout") ?? "");
  const widgetsStr = String(formData.get("widgets") ?? "");
  if (!layoutStr || !widgetsStr) return;

  const layout = JSON.parse(layoutStr) as LayoutItem[];
  const widgets = JSON.parse(widgetsStr) as WidgetInstance[];

  const activeId = await getActiveLayoutId(session.user.id);
  if (activeId) {
    await prisma.dashboardLayout.update({
      where: { id: activeId },
      data: {
        layout: layout as unknown as Prisma.InputJsonValue,
        widgets: widgets as unknown as Prisma.InputJsonValue,
      },
    });
  } else {
    await prisma.dashboardLayout.create({
      data: {
        userId: session.user.id,
        name: "Default",
        isDefault: true,
        layout: layout as unknown as Prisma.InputJsonValue,
        widgets: widgets as unknown as Prisma.InputJsonValue,
      },
    });
  }
  revalidatePath("/dashboard");
}

export async function resetLayout() {
  const session = await requireSession();
  const { layout, widgets } = session.user.role === "SALES_REP" ? defaultRepLayout() : defaultOwnerLayout();
  const activeId = await getActiveLayoutId(session.user.id);
  if (activeId) {
    await prisma.dashboardLayout.update({
      where: { id: activeId },
      data: {
        layout: layout as unknown as Prisma.InputJsonValue,
        widgets: widgets as unknown as Prisma.InputJsonValue,
      },
    });
  } else {
    await prisma.dashboardLayout.create({
      data: {
        userId: session.user.id,
        name: "Default",
        isDefault: true,
        layout: layout as unknown as Prisma.InputJsonValue,
        widgets: widgets as unknown as Prisma.InputJsonValue,
      },
    });
  }
  revalidatePath("/dashboard");
}

/** Duplicate the current layout with a new name; make it the new active. */
export async function saveLayoutAs(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name required");

  const current = await prisma.dashboardLayout.findFirst({
    where: { userId: session.user.id, isDefault: true },
    orderBy: { updatedAt: "desc" },
  });
  const fallback = session.user.role === "SALES_REP" ? defaultRepLayout() : defaultOwnerLayout();
  const layout = current?.layout ?? (fallback.layout as unknown as Prisma.InputJsonValue);
  const widgets = current?.widgets ?? (fallback.widgets as unknown as Prisma.InputJsonValue);

  // Demote any existing default
  await prisma.dashboardLayout.updateMany({
    where: { userId: session.user.id, isDefault: true },
    data: { isDefault: false },
  });

  await prisma.dashboardLayout.create({
    data: {
      userId: session.user.id,
      name,
      isDefault: true,
      layout: layout as unknown as Prisma.InputJsonValue,
      widgets: widgets as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/dashboard");
}

export async function switchLayout(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const target = await prisma.dashboardLayout.findUnique({ where: { id } });
  if (!target || target.userId !== session.user.id) throw new Error("Not found");

  await prisma.dashboardLayout.updateMany({
    where: { userId: session.user.id, isDefault: true },
    data: { isDefault: false },
  });
  await prisma.dashboardLayout.update({
    where: { id },
    data: { isDefault: true },
  });
  revalidatePath("/dashboard");
}

export async function deleteLayout(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const target = await prisma.dashboardLayout.findUnique({ where: { id } });
  if (!target || target.userId !== session.user.id) throw new Error("Not found");

  const wasActive = target.isDefault;
  await prisma.dashboardLayout.delete({ where: { id } });

  // If we just deleted the active, promote another (if any) to active.
  if (wasActive) {
    const any = await prisma.dashboardLayout.findFirst({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
    });
    if (any) {
      await prisma.dashboardLayout.update({
        where: { id: any.id },
        data: { isDefault: true },
      });
    }
  }
  revalidatePath("/dashboard");
}

export async function renameLayout(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) throw new Error("Missing fields");
  const target = await prisma.dashboardLayout.findUnique({ where: { id } });
  if (!target || target.userId !== session.user.id) throw new Error("Not found");
  await prisma.dashboardLayout.update({ where: { id }, data: { name } });
  revalidatePath("/dashboard");
}
