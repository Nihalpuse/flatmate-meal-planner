"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_ITEMS, isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function TopNav({ groupName }: { groupName: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 hidden border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md md:block">
      <div className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
        <span className="font-extrabold">🍛 {groupName}</span>
        <nav aria-label="Primary" className="flex items-center gap-4 text-sm">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "font-semibold",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
