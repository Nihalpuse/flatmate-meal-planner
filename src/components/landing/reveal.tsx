"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ComponentProps } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Scroll-in reveal wrapper. Fades + lifts its children when they enter the
 * viewport once. Collapses to static under prefers-reduced-motion. Children are
 * rendered by the (server) parent and passed through, so only this leaf is a
 * Client Component.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  ...props
}: ComponentProps<typeof motion.div> & { delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
