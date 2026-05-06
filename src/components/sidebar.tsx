"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  Handshake,
  Mail,
  BarChart3,
  Settings,
  Users,
  ClipboardList,
  Shield,
  Upload,
  DollarSign,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";

export interface SidebarItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}

const NAV: SidebarItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["OWNER", "LIMITED_ADMIN", "SALES_REP", "REGIONAL_MANAGER"] },
  { href: "/companies", label: "Companies", icon: Building2, roles: ["OWNER", "LIMITED_ADMIN", "SALES_REP", "REGIONAL_MANAGER"] },
  { href: "/jobs", label: "Jobs", icon: Briefcase, roles: ["OWNER", "LIMITED_ADMIN", "SALES_REP", "REGIONAL_MANAGER"] },
  { href: "/deals", label: "Deals", icon: Handshake, roles: ["OWNER", "LIMITED_ADMIN", "SALES_REP"] },
  { href: "/commission", label: "Commission", icon: DollarSign, roles: ["OWNER", "LIMITED_ADMIN", "SALES_REP"] },
  { href: "/campaigns", label: "Campaigns", icon: Mail, roles: ["OWNER", "LIMITED_ADMIN"] },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ["OWNER", "LIMITED_ADMIN", "REGIONAL_MANAGER"] },
  { href: "/notifications", label: "Notifications", icon: Bell, roles: ["OWNER", "LIMITED_ADMIN", "SALES_REP", "REGIONAL_MANAGER"] },
  { href: "/import", label: "CSV Import", icon: Upload, roles: ["OWNER", "LIMITED_ADMIN"] },
  { href: "/users", label: "Users", icon: Users, roles: ["OWNER"] },
  { href: "/audit-log", label: "Audit Log", icon: ClipboardList, roles: ["OWNER"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["OWNER", "LIMITED_ADMIN"] },
];

export function Sidebar({ role, userName }: { role: Role; userName: string }) {
  const pathname = usePathname();
  const visible = NAV.filter((n) => n.roles.includes(role));

  return (
    <aside data-sidebar className="flex h-full w-60 shrink-0 flex-col border-r border-(--color-border) bg-(--color-card)">
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="h-8 w-8 rounded-[10px] bg-(--color-accent) flex items-center justify-center text-(--color-accent-foreground) font-bold text-sm">
          SMG
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">Solar Maintenance</span>
          <span className="text-xs text-(--color-muted-foreground)">Sales CRM</span>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {visible.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-(--color-accent)/15 text-(--color-accent)"
                  : "text-(--color-foreground) hover:bg-(--color-muted)"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-(--color-border) px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-(--color-muted-foreground)" />
          <span className="truncate">{userName}</span>
        </div>
        <div className="mt-1 text-(--color-muted-foreground) text-[11px]">
          {role === "OWNER" ? "Owner" : role === "LIMITED_ADMIN" ? "Limited Admin" : role === "SALES_REP" ? "Sales Rep" : "Regional Manager"}
        </div>
        <Link
          href="/profile"
          className="mt-2 inline-block text-[11px] text-(--color-muted-foreground) hover:text-(--color-accent)"
        >
          Profile &amp; password →
        </Link>
      </div>
    </aside>
  );
}
