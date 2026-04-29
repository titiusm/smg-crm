import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileSidebarToggle } from "@/components/mobile-sidebar-toggle";
import { Button } from "@/components/ui/button";
import { LogOut, Bell } from "lucide-react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { role, firstName, lastName, id: userId } = session.user;

  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false },
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={role} userName={`${firstName} ${lastName}`} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-(--color-border) bg-(--color-card) px-4 md:px-6">
          <div className="flex items-center gap-2">
            <MobileSidebarToggle />
            <div className="text-sm text-(--color-muted-foreground) hidden sm:block">
              The Solar Maintenance Guys — Sales CRM
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/notifications">
              <Button variant="ghost" size="icon" aria-label="Notifications" title="Notifications">
                <span className="relative inline-flex">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 ? (
                    <span className="absolute -top-1.5 -right-2 inline-flex min-w-[16px] justify-center rounded-full bg-(--color-accent) px-1 text-[10px] font-semibold text-(--color-accent-foreground) leading-[16px]">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </span>
              </Button>
            </Link>
            <ThemeToggle />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button variant="ghost" size="icon" type="submit" aria-label="Sign out" title="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
