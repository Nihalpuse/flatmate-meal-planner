"use client";

import { Plus, Search, Sparkles } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addSuggestionFromCatalog,
  addSuggestionWithAI,
  searchDishesAction,
} from "@/app/(protected)/dashboard/suggestion-actions";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import type { DishHit } from "@/lib/dishes";

export function AddSuggestion({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DishHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, start] = useTransition();

  // Debounced catalog search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await searchDishesAction(q);
      setHits(res);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const trimmed = query.trim();
  const hasExact = hits.some(
    (h) => h.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const showAi = trimmed.length > 0 && !hasExact && !searching;

  function close() {
    setOpen(false);
    setQuery("");
    setHits([]);
  }

  function addCatalog(dishId: string) {
    start(async () => {
      const res = await addSuggestionFromCatalog(sessionId, dishId);
      if (res.error) toast.error(res.error);
      else close();
    });
  }

  function addAi() {
    start(async () => {
      const res = await addSuggestionWithAI(sessionId, trimmed);
      if (res.error) toast.error(res.error);
      else close();
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add a dish
      </Button>
    );
  }

  return (
    <GlassCard className="space-y-2 p-3">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <input
          role="combobox"
          aria-expanded
          aria-label="Search dishes"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a dish, or type a new one"
          className="bg-card w-full rounded-lg border py-2 pr-3 pl-9 text-sm"
        />
      </div>

      {trimmed.length > 0 ? (
        <ul role="listbox" className="max-h-56 space-y-1 overflow-y-auto">
          {hits.map((h) => (
            <li key={h.id} role="option" aria-selected={false}>
              <button
                type="button"
                disabled={pending}
                onClick={() => addCatalog(h.id)}
                className="hover:bg-muted flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold"
              >
                {h.name}
                <Plus className="text-muted-foreground size-4" />
              </button>
            </li>
          ))}
          {showAi ? (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                disabled={pending}
                onClick={addAi}
                className="hover:bg-muted text-primary flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold"
              >
                <Sparkles className="size-4" />
                Search &ldquo;{trimmed}&rdquo; with AI
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      <Button variant="ghost" size="sm" className="w-full" onClick={close}>
        Cancel
      </Button>
    </GlassCard>
  );
}
