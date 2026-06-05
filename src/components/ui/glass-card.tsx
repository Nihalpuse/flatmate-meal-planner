import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Frosted glass surface. Uses backdrop-blur with a near-opaque fallback so
 * text stays readable where backdrop-filter is unsupported.
 */
export function GlassCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="glass-card"
      className={cn(
        "rounded-[22px] border p-4",
        "bg-card supports-[backdrop-filter]:bg-[var(--glass-bg)]",
        "supports-[backdrop-filter]:backdrop-blur-md supports-[backdrop-filter]:backdrop-saturate-150",
        "border-[var(--glass-border)]",
        "shadow-[0_6px_20px_var(--glass-shadow),inset_0_1px_0_var(--glass-highlight)]",
        className,
      )}
      {...props}
    />
  );
}
