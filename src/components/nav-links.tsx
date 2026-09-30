"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListChecks, Phone, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/database.types";

// Single source of truth for navigation. Order here is the display order.
const NAV_ITEMS: {
  href: string;
  label: string;
  roles: UserRole[];
  icon: typeof ListChecks;
}[] = [
  { href: "/tally", label: "Tally", roles: ["owner", "ops"], icon: ListChecks },
  { href: "/setter", label: "Setter", roles: ["owner", "ops", "setter"], icon: Phone },
  { href: "/dashboard", label: "Dashboard", roles: ["owner", "ops"], icon: LayoutDashboard },
  { href: "/dripify", label: "Dripify", roles: ["owner", "ops"], icon: Send },
];

export function homeForRole(role: UserRole | null): string {
  return role === "setter" ? "/setter" : "/tally";
}

export function NavLinks({
  role,
  variant,
}: {
  role: UserRole | null;
  variant: "top" | "bottom";
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => role && item.roles.includes(role));

  if (variant === "top") {
    return (
      <nav className="flex items-center gap-1" aria-label="Main">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
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
    );
  }

  return (
    <>
      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
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
    </>
  );
}
