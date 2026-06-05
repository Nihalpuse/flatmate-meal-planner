"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import { generateSuggestions } from "@/app/(protected)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Kicker } from "@/components/ui/kicker";
import { missingIngredients } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import type { MealSession, MealSuggestion } from "@/db/schema";

interface SessionData {
  session: MealSession;
  suggestions: MealSuggestion[];
}

export function DashboardView({
  available,
  lunch,
  dinner,
}: {
  available: string[];
  lunch: SessionData;
  dinner: SessionData;
}) {
  const [tab, setTab] = useState<"lunch" | "dinner">("lunch");
  const active = tab === "lunch" ? lunch : dinner;

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

      <SessionPanel key={active.session.id} data={active} available={available} />
    </section>
  );
}

function SessionPanel({ data, available }: { data: SessionData; available: string[] }) {
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Kicker>{data.suggestions.length} suggestions</Kicker>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await generateSuggestions(data.session.id);
            })
          }
        >
          <Sparkles className="size-4" />
          {pending ? "Generating…" : data.suggestions.length ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {data.suggestions.length === 0 ? (
        <GlassCard className="text-muted-foreground text-sm">
          No suggestions yet. Tap Generate to get AI ideas from your pantry.
        </GlassCard>
      ) : (
        <ul className="space-y-2">
          {data.suggestions.map((s) => {
            const missing = missingIngredients(s.requiredIngredients, available);
            return (
              <li key={s.id}>
                <GlassCard className="space-y-1">
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
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
