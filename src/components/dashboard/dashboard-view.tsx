"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { generateSuggestions } from "@/app/(protected)/dashboard/actions";
import { castVote, finalizeSession } from "@/app/(protected)/dashboard/vote-actions";
import { Button } from "@/components/ui/button";
import { CountChip } from "@/components/ui/count-chip";
import { GlassCard } from "@/components/ui/glass-card";
import { Kicker } from "@/components/ui/kicker";
import { missingIngredients } from "@/lib/meal-utils";
import type { SuggestionVote } from "@/lib/votes";
import type { MealSession } from "@/db/schema";
import { cn } from "@/lib/utils";

export interface SessionBundle {
  session: MealSession;
  suggestions: SuggestionVote[];
  totalVoters: number;
  finalized: { mealName: string } | null;
}

export function DashboardView({
  available,
  isAdmin,
  memberCount,
  lunch,
  dinner,
}: {
  available: string[];
  isAdmin: boolean;
  memberCount: number;
  lunch: SessionBundle;
  dinner: SessionBundle;
}) {
  const [tab, setTab] = useState<"lunch" | "dinner">("lunch");
  const active = tab === "lunch" ? lunch : dinner;

  const router = useRouter();
  const allSettled = Boolean(lunch.finalized && dinner.finalized);

  // Flatmates vote from their own phones — poll so their votes show up live.
  useEffect(() => {
    if (allSettled) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 8000);
    return () => clearInterval(id);
  }, [allSettled, router]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-extrabold">Today</h1>
      <div role="tablist" className="flex gap-2">
        {(["lunch", "dinner"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-xl border py-2 text-sm font-bold capitalize",
              tab === t ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <SessionPanel
        key={active.session.id}
        bundle={active}
        available={available}
        isAdmin={isAdmin}
        memberCount={memberCount}
      />
    </section>
  );
}

function SessionPanel({
  bundle,
  available,
  isAdmin,
  memberCount,
}: {
  bundle: SessionBundle;
  available: string[];
  isAdmin: boolean;
  memberCount: number;
}) {
  const [pending, start] = useTransition();
  const [generating, setGenerating] = useState(false);
  const { session, suggestions, totalVoters, finalized } = bundle;

  if (session.status === "finalized" && finalized) {
    const chosen = suggestions.find((s) => s.mealName === finalized.mealName);
    const missing = chosen ? missingIngredients(chosen.requiredIngredients, available) : [];
    return (
      <GlassCard className="space-y-2">
        <Kicker variant="solid">Finalized</Kicker>
        <div className="text-xl font-extrabold">🍽️ {finalized.mealName}</div>
        {missing.length > 0 ? (
          <div className="space-y-1">
            <div className="text-sm font-semibold">Shopping list:</div>
            <div className="text-destructive text-sm">{missing.join(", ")}</div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard?.writeText(missing.join(", "));
                toast.success("Grocery list copied");
              }}
            >
              Copy list
            </Button>
          </div>
        ) : (
          <div className="text-sm text-emerald-600">You have everything. 🎉</div>
        )}
      </GlassCard>
    );
  }

  function runVote(suggestionId: string) {
    start(async () => {
      const res = await castVote(session.id, suggestionId);
      if (res.error) toast.error(res.error);
    });
  }

  function runGenerate() {
    setGenerating(true);
    start(async () => {
      const res = await generateSuggestions(session.id);
      if (res.error) toast.error(res.error);
      setGenerating(false);
    });
  }

  function runFinalize() {
    start(async () => {
      const res = await finalizeSession(session.id);
      if (res.error) toast.error(res.error);
      else toast.success("Meal finalized!");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Kicker>
          {totalVoters} of {memberCount} voted
        </Kicker>
        <Button size="sm" variant="outline" disabled={pending} onClick={runGenerate}>
          <Sparkles className="size-4" />
          {suggestions.length ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {generating ? (
        <ul className="space-y-2" aria-label="Generating suggestions">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i}>
              <GlassCard className="h-14 animate-pulse" />
            </li>
          ))}
        </ul>
      ) : suggestions.length === 0 ? (
        <GlassCard className="text-muted-foreground text-sm">
          No suggestions yet. Tap Generate to get AI ideas from your pantry.
        </GlassCard>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((s) => {
            const missing = missingIngredients(s.requiredIngredients, available);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => runVote(s.id)}
                  aria-pressed={s.mine}
                  className="w-full text-left"
                >
                  <GlassCard
                    className={cn(
                      "flex items-center gap-3",
                      s.mine && "ring-2 ring-primary",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{s.mealName}</div>
                      {missing.length > 0 ? (
                        <div className="text-destructive text-xs font-semibold">
                          ⚠ needs {missing.join(", ")}
                        </div>
                      ) : (
                        <div className="text-xs font-semibold text-emerald-600">
                          ✓ you have everything
                        </div>
                      )}
                    </div>
                    <CountChip count={s.votes} />
                  </GlassCard>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {isAdmin && suggestions.length > 0 ? (
        <Button className="w-full" disabled={pending || totalVoters === 0} onClick={runFinalize}>
          Finalize {totalVoters === 0 ? "(no votes yet)" : "winning meal"}
        </Button>
      ) : null}
    </div>
  );
}
