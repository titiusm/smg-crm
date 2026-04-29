import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WidgetGrid } from "@/components/widgets/widget-grid";
import { renderWidget } from "@/components/widgets/widget-renderer";
import { LayoutSwitcher } from "@/components/widgets/layout-switcher";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { defaultOwnerLayout, defaultRepLayout, type LayoutItem, type WidgetInstance } from "@/lib/widgets";
import { isOwner } from "@/lib/rbac";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) return null;
  const { id: userId, role, firstName } = session.user;

  // Load all saved layouts for this user; active = isDefault=true.
  const allLayouts = await prisma.dashboardLayout.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, isDefault: true, layout: true, widgets: true },
  });
  const active = allLayouts.find((l) => l.isDefault) ?? allLayouts[0];
  const defaults = role === "SALES_REP" ? defaultRepLayout() : defaultOwnerLayout();
  const layout = (active?.layout as unknown as LayoutItem[]) ?? defaults.layout;
  const widgets = (active?.widgets as unknown as WidgetInstance[]) ?? defaults.widgets;

  // Pre-render each widget on the server; pass as React nodes to the client grid.
  const widgetContent: Record<string, React.ReactNode> = {};
  for (const w of widgets) {
    widgetContent[w.id] = await renderWidget(w.type, { userId, role });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isOwner(role) ? `Welcome back, ${firstName}` : `Good to see you, ${firstName}`}
          </h1>
          <p className="text-sm text-(--color-muted-foreground)">
            {isOwner(role)
              ? `Your customizable dashboard. Click "Edit layout" to rearrange widgets.`
              : "Your next actions and performance stats."}
          </p>
        </div>
        {allLayouts.length > 0 ? (
          <LayoutSwitcher
            layouts={allLayouts.map((l) => ({ id: l.id, name: l.name, isDefault: l.isDefault }))}
            activeId={active?.id ?? null}
          />
        ) : null}
      </div>

      {isOwner(role) ? <OnboardingChecklist /> : null}

      <WidgetGrid
        initialLayout={layout}
        initialWidgets={widgets}
        widgetContent={widgetContent}
      />
    </div>
  );
}
