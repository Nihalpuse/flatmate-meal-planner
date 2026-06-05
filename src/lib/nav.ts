import { CalendarClock, Carrot, Home, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/pantry", label: "Pantry", icon: Carrot },
  { href: "/history", label: "History", icon: CalendarClock },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** A tab is active for its exact route or any nested child route. */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
