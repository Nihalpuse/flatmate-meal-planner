"use client";

import { Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { generateSuggestions } from "@/app/(protected)/dashboard/actions";
import { castVote, clearVote, finalizeSession } from "@/app/(protected)/dashboard/vote-actions";
import { removeSuggestionFromSession } from "@/app/(protected)/dashboard/suggestion-actions";
import { AddSuggestion } from "@/components/dashboard/add-suggestion";
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
  currentUserId,
  memberCount,
  lunch,
  dinner,
}: {
  available: string[];
  isAdmin: boolean;
  currentUserId: string;
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
        currentUserId={currentUserId}
        memberCount={memberCount}
      />
    </section>
  );
}

type View = { suggestions: SuggestionVote[]; totalVoters: number };

function SessionPanel({
  bundle,
  available,
  isAdmin,
  currentUserId,
  memberCount,
}: {
  bundle: SessionBundle;
  available: string[];
  isAdmin: boolean;
  currentUserId: string;
  memberCount: number;
}) {
  const [pending, start] = useTransition();
  const [generating, setGenerating] = useState(false);
  const { session, suggestions, totalVoters, finalized } = bundle;

  const [view, applyPick] = useOptimistic<View, string>(
    { suggestions, totalVoters },
    (state, tappedId) => {
      const prevPick = state.suggestions.find((s) => s.mine)?.id ?? null;
      const unvote = prevPick === tappedId;
      return {
        totalVoters: unvote
          ? state.totalVoters - 1
          : state.totalVoters + (prevPick === null ? 1 : 0),
        suggestions: state.suggestions.map((s) => {
          if (s.id === tappedId) {
            return { ...s, mine: !unvote, votes: s.votes + (unvote ? -1 : 1) };
          }
          if (s.id === prevPick) {
            return { ...s, mine: false, votes: s.votes - 1 };
          }
          return s;
        }),
      };
    },
  );

  function runVote(id: string) {
    const wasMine = view.suggestions.find((s) => s.id === id)?.mine ?? false;
    start(async () => {
      applyPick(id);
      const res = wasMine ? await clearVote(session.id) : await castVote(session.id, id);
      if (res.error) toast.error(res.error);
    });
  }

  function runRemove(id: string) {
    start(async () => {
      const res = await removeSuggestionFromSession(session.id, id);
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

  if (session.status === "finalized" && finalized) {
    const chosen = suggestions.find((s) => s.mealName === finalized.mealName);
    const missing = chosen ? missingIngredients(chosen.requiredIngredients, available) : [];
    return (
      <GlassCard className="space-y-2">
        <Kicker variant="solid">Finalized</Kicker>
        <div className="text-xl font-extrabold">{finalized.mealName}</div>
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
          <div className="text-muted-foreground text-sm">You have everything.</div>
        )}
      </GlassCard>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Kicker>
          {view.totalVoters} of {memberCount} voted
        </Kicker>
        <Button size="sm" variant="outline" disabled={pending} onClick={runGenerate}>
          <Sparkles className="size-4" />
          {view.suggestions.length ? "Regenerate" : "Generate"}
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
      ) : view.suggestions.length === 0 ? (
        <GlassCard className="text-muted-foreground text-sm">
          No suggestions yet. Tap Generate, or add a dish below.
        </GlassCard>
      ) : (
        <ul className="space-y-2">
          {view.suggestions.map((s) => {
            const missing = missingIngredients(s.requiredIngredients, available);
            const canRemove = isAdmin || s.addedBy === currentUserId;
            return (
              <li key={s.id}>
                <GlassCard
                  className={cn("flex items-center gap-3", s.mine && "ring-2 ring-primary")}
                >
                  <button
                    type="button"
                    onClick={() => runVote(s.id)}
                    aria-pressed={s.mine}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="font-bold">{s.mealName}</div>
                    {missing.length > 0 ? (
                      <div className="text-destructive text-xs font-semibold">
                        needs {missing.join(", ")}
                      </div>
                    ) : (
                      <div className="text-muted-foreground text-xs font-semibold">
                        you have everything
                      </div>
                    )}
                  </button>
                  <CountChip count={s.votes} />
                  {canRemove ? (
                    <button
                      type="button"
                      aria-label={`Remove ${s.mealName}`}
                      disabled={pending}
                      onClick={() => runRemove(s.id)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}

      {!generating ? <AddSuggestion sessionId={session.id} /> : null}

      {isAdmin && view.suggestions.length > 0 ? (
        <Button
          className="w-full"
          disabled={pending || view.totalVoters === 0}
          onClick={runFinalize}
        >
          Finalize {view.totalVoters === 0 ? "(no votes yet)" : "winning meal"}
        </Button>
      ) : null}
    </div>
  );
}
