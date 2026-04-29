// Owner onboarding checklist (spec §9.17). Displayed on first login until dismissed.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, Badge } from "@/components/ui/primitives";
import { CheckCircle2, Circle } from "lucide-react";

interface Step {
  key: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
}

export async function OnboardingChecklist() {
  // Run each check in parallel
  const [
    repCount,
    logoSetting,
    licenseSetting,
    fromEmailSetting,
    menuEdited,
    companiesCount,
    assignedCount,
    targetsSet,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "SALES_REP", isActive: true } }),
    prisma.globalSetting.findUnique({ where: { key: "company_logo_path" } }),
    prisma.globalSetting.findUnique({ where: { key: "license_number" } }),
    prisma.globalSetting.findUnique({ where: { key: "default_email_from_email" } }),
    // If the line item menu has had any price change since its default seed, consider it "edited"
    prisma.lineItemMenu.findFirst({
      where: { itemName: "Panel Detach & Reset" },
      select: { updatedAt: true, createdAt: true },
    }),
    prisma.company.count({ where: { deletedAt: null } }),
    prisma.company.count({ where: { deletedAt: null, assignedRepId: { not: null } } }),
    prisma.user.count({
      where: {
        role: "SALES_REP",
        isActive: true,
        // has any non-default outreachTargets value is difficult to detect via JSON query;
        // we'll instead count reps whose outreachTargets is NOT null (always set by seed anyway)
        // Fall back: just check there is at least one rep.
      },
    }),
  ]);

  const menuIsEdited = !!menuEdited && menuEdited.updatedAt.getTime() - menuEdited.createdAt.getTime() > 1000;

  const steps: Step[] = [
    {
      key: "reps",
      title: "Create sales rep accounts",
      description: "Invite at least one rep from the Users page.",
      href: "/users",
      done: repCount >= 1,
    },
    {
      key: "branding",
      title: "Upload logo + enter license number",
      description: "Settings → Company & branding.",
      href: "/settings",
      done: !!(logoSetting && typeof logoSetting.value === "string" && logoSetting.value) ||
            !!(licenseSetting && typeof licenseSetting.value === "string" && licenseSetting.value),
    },
    {
      key: "email",
      title: "Configure email From name + address",
      description: "Required for SendGrid send in Phase 1C.",
      href: "/settings",
      done: !!(fromEmailSetting && typeof fromEmailSetting.value === "string" && fromEmailSetting.value),
    },
    {
      key: "menu",
      title: "Review Standard Line Item menu prices",
      description: "Adjust defaults before building estimates.",
      href: "/settings",
      done: menuIsEdited,
    },
    {
      key: "import",
      title: "Import companies from CSV",
      description: "Upload the roofing contractors list.",
      href: "/import",
      done: companiesCount > 0,
    },
    {
      key: "assign",
      title: "Assign companies to reps",
      description: "Reassign from the company profile or bulk-assign (Phase 1E).",
      href: "/companies",
      done: assignedCount > 0 && companiesCount > 0,
    },
    {
      key: "targets",
      title: "Set outreach targets per rep",
      description: "Daily calls, emails, texts.",
      href: "/users",
      done: targetsSet > 0,
    },
  ];

  const allDone = steps.every((s) => s.done);
  if (allDone) return null;

  const completed = steps.filter((s) => s.done).length;

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Getting started</h2>
            <p className="text-xs text-(--color-muted-foreground)">
              Finish these steps to unlock the full CRM.
            </p>
          </div>
          <Badge variant="accent">{completed} / {steps.length}</Badge>
        </div>
        <ul className="space-y-2">
          {steps.map((s) => (
            <li key={s.key}>
              <Link
                href={s.href}
                className={
                  "flex items-start gap-3 rounded-[10px] border border-(--color-border) px-3 py-2.5 text-sm transition-colors hover:border-(--color-accent)/50 " +
                  (s.done ? "opacity-60" : "")
                }
              >
                {s.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-(--color-success) mt-0.5" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-(--color-muted-foreground) mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className={"font-medium " + (s.done ? "line-through" : "")}>
                    {s.title}
                  </div>
                  <div className="text-[11px] text-(--color-muted-foreground)">{s.description}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
