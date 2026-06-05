"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { GlassCard } from "@/components/ui/glass-card";
import { NAV_ITEMS, isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-3 bottom-3 z-40 md:hidden"
    >
      <GlassCard className="flex items-center justify-around rounded-3xl p-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-bold",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </GlassCard>
    </nav>
  );
}
