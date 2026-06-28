"use client";

import { Check } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { memo, useEffect, useState } from "react";

import { CountChip } from "@/components/ui/count-chip";
import { GlassCard } from "@/components/ui/glass-card";
import { Kicker } from "@/components/ui/kicker";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { name: "Egg Fried Rice", base: 2, win: true },
  { name: "Aloo Jeera + Roti", base: 1, win: false },
];

/**
 * Live mini vote card built from the real design-system components. One
 * motivated motion: a third vote lands on the winner shortly after mount,
 * bumping its count and settling the "your vote" ring. Communicates the core
 * action (group voting) without faking a screenshot.
 */
function VotePreviewImpl() {
  const reduce = useReducedMotion();
  const [landed, setLanded] = useState(false);
  // Reduced motion shows the settled (voted) state immediately; otherwise the
  // third vote lands shortly after mount.
  const voted = reduce === true ? true : landed;

  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setLanded(true), 1000);
    return () => clearTimeout(t);
  }, [reduce]);

  return (
    <GlassCard className="w-full max-w-sm space-y-3 p-5">
      <div className="flex items-center justify-between">
        <Kicker>Tonight, Dinner</Kicker>
        <Kicker variant="solid">{voted ? "2 of 3 voted" : "1 of 3 voted"}</Kicker>
      </div>
      <ul className="space-y-2">
        {OPTIONS.map((o) => {
          const mine = o.win && voted;
          const count = mine ? o.base + 1 : o.base;
          return (
            <li key={o.name}>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-[16px] border border-[var(--glass-border)] bg-background/40 p-3 transition-shadow",
                  mine && "ring-2 ring-primary",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{o.name}</div>
                  <div className="text-muted-foreground flex items-center gap-1 text-xs font-semibold">
                    <Check className="text-primary size-3.5" strokeWidth={2.5} />
                    you have everything
                  </div>
                </div>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={count}
                    initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 320, damping: 22 }}
                  >
                    <CountChip count={count} />
                  </motion.span>
                </AnimatePresence>
              </div>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}

export const VotePreview = memo(VotePreviewImpl);
