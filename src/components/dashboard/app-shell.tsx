"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { logoutAction } from "@/actions/auth-actions";
import type { AuthUser } from "@/services/auth.service";
import { iconMap, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function DesktopNav({ navItems }: { navItems: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-1 p-3" aria-label="التنقل الرئيسي">
      {navItems.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = iconMap[item.icon];
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground/80 hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  user,
  navItems,
  children,
}: {
  user: AuthUser;
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-muted/40">
      {/* Sidebar (desktop / tablet) */}
      <aside className="fixed inset-y-0 start-0 hidden w-64 flex-col border-e bg-background md:flex">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <span className="size-2 rounded-full bg-accent" aria-hidden />
          <span className="font-heading text-sm font-bold">نكسا ريتيل</span>
        </div>
        <DesktopNav navItems={navItems} />
        <div className="border-t p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground" dir="ltr">
              {user.username}
            </p>
          </div>
          <form action={logoutAction}>
            <Button variant="outline" type="submit" className="w-full justify-start">
              <LogOutIcon className="size-4" aria-hidden />
              تسجيل الخروج
            </Button>
          </form>
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <header className="flex items-center justify-between border-b bg-background px-4 py-3 md:hidden">
        <span className="font-heading text-sm font-bold">نكسا ريتيل</span>
        <form action={logoutAction}>
          <Button variant="ghost" size="icon-sm" type="submit" aria-label="تسجيل الخروج">
            <LogOutIcon className="size-4" aria-hidden />
          </Button>
        </form>
      </header>
      <nav
        className="flex gap-1 overflow-x-auto border-b bg-background px-3 py-2 md:hidden"
        aria-label="التنقل الرئيسي"
      >
        <MobileNavLinks navItems={navItems} />
      </nav>

      <main className="md:ms-64">
        <div className="mx-auto w-full max-w-5xl p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}

function MobileNavLinks({ navItems }: { navItems: NavItem[] }) {
  const pathname = usePathname();
  return (
    <>
      {navItems.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = iconMap[item.icon];
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm",
              active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-muted",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
