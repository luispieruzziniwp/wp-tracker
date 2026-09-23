"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/database.types";

const LINKS: { href: string; label: string; roles: UserRole[] }[] = [
  { href: "/tally", label: "Tally", roles: ["owner", "ops", "setter"] },
  { href: "/dashboard", label: "Dashboard", roles: ["owner", "ops"] },
];

export function NavLinks({ role }: { role: UserRole | null }) {
  const pathname = usePathname();
  const links = LINKS.filter((link) => role && link.roles.includes(role));

  if (links.length < 2) return null;

  return (
    <nav className="flex items-center gap-1">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
