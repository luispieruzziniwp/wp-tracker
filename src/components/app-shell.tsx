"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, LayoutDashboard, ListChecks, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/lib/supabase/database.types";

const NAV_ITEMS: {
  href: string;
  label: string;
  roles: UserRole[];
  icon: typeof ListChecks;
}[] = [
  { href: "/tally", label: "Tally", roles: ["owner", "ops", "setter"], icon: ListChecks },
  { href: "/dashboard", label: "Dashboard", roles: ["owner", "ops"], icon: LayoutDashboard },
];

export function AppShell({
  role,
  onSignOut,
  children,
}: {
  role: UserRole | null;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => role && item.roles.includes(role));

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 hidden border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:block">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Check className="h-4 w-4" strokeWidth={3} />
            </span>
            <span className="font-serif text-base tracking-tight">
              Wisdom Partners
            </span>
          </div>
          <nav className="flex items-center gap-1">
            {items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <Button variant="ghost" size="sm" onClick={onSignOut} className="gap-1.5">
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6 md:max-w-5xl md:pb-10">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-md items-stretch">
          {items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors active:scale-95",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={onSignOut}
            className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium text-muted-foreground transition-colors active:scale-95"
          >
            <LogOut className="h-5 w-5" />
            Sign out
          </button>
        </div>
      </nav>
    </div>
  );
}
