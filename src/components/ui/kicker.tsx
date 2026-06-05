import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const kickerVariants = cva(
  "inline-block font-mono text-[10px] font-bold uppercase tracking-wider",
  {
    variants: {
      variant: {
        plain: "text-muted-foreground",
        solid: "rounded-full bg-primary px-2 py-0.5 text-primary-foreground",
      },
    },
    defaultVariants: { variant: "plain" },
  },
);

export function Kicker({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof kickerVariants>) {
  return (
    <span className={cn(kickerVariants({ variant }), className)} {...props} />
  );
}
