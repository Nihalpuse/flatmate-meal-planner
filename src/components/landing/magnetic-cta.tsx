"use client";

import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useRef } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MotionLink = motion.create(Link);

/**
 * Primary CTA that eases toward the cursor (magnetic). Continuous pointer
 * values live in motion values (never useState) so the React tree does not
 * re-render on move. Falls back to a plain button under reduced motion.
 */
export function MagneticCta({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLAnchorElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 150, damping: 15, mass: 0.1 });
  const y = useSpring(my, { stiffness: 150, damping: 15, mass: 0.1 });

  function handleMove(e: React.MouseEvent) {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - (r.left + r.width / 2)) * 0.3);
    my.set((e.clientY - (r.top + r.height / 2)) * 0.3);
  }

  function reset() {
    mx.set(0);
    my.set(0);
  }

  return (
    <MotionLink
      ref={ref}
      href={href}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      style={reduce ? undefined : { x, y }}
      className={cn(
        buttonVariants({ size: "lg" }),
        "h-11 px-6 text-[15px] active:translate-y-px",
        className,
      )}
    >
      {children}
    </MotionLink>
  );
}
