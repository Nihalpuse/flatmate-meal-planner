import { CalendarClock, Carrot, Home, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Fully prefetch the route, data included, and keep it in the client cache.
   *
   * Every route here is dynamic (the layout reads the session cookie), and Next
   * gives dynamic routes no client cache and prefetches them only as far as the
   * loading boundary — so the skeleton shows on every single navigation. Opting a
   * link into full prefetching swaps that for the 5-minute static cache window.
   *
   * Only safe where the data may be a few minutes stale. Deliberately NOT set on
   * the dashboard: its vote tally is live and shared, and showing a stale one is
   * how the group ends up cooking the wrong dinner. The user's own writes call
   * revalidatePath and drop the cache, so only a flatmate's edits can lag.
   */
  prefetch?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/pantry", label: "Pantry", icon: Carrot, prefetch: true },
  { href: "/history", label: "History", icon: CalendarClock, prefetch: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** A tab is active for its exact route or any nested child route. */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
