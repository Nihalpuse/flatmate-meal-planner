"use client";

import { Plus, Search, Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ParsedItem } from "@/lib/ai/parse-purchase";
import { filterIngredients } from "@/lib/pantry/filter";
import type { Ingredient } from "@/db/schema";

import { IngredientRow } from "./ingredient-row";
import { IngredientSheet } from "./ingredient-sheet";
import { PurchaseInput } from "./purchase-input";
import { PurchaseReview } from "./purchase-review";

export function PantryView({ ingredients }: { ingredients: Ingredient[] }) {
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<{ editing: Ingredient | null } | null>(null);
  const [textFlow, setTextFlow] = useState<
    { step: "input" } | { step: "review"; items: ParsedItem[] } | null
  >(null);

  const visible = filterIngredients(ingredients, query);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Pantry</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTextFlow({ step: "input" })}>
            <Sparkles className="size-4" /> Add by text
          </Button>
          <Button onClick={() => setSheet({ editing: null })}>
            <Plus className="size-4" /> Add
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ingredients"
          aria-label="Search ingredients"
          className="bg-card w-full rounded-lg border py-2 pr-3 pl-9"
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {ingredients.length === 0 ? "No ingredients yet. Add your first one." : "No matches."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((ingredient) => (
            <li key={ingredient.id}>
              <IngredientRow
                ingredient={ingredient}
                onEdit={(ing) => setSheet({ editing: ing })}
              />
            </li>
          ))}
        </ul>
      )}

      {sheet ? (
        <IngredientSheet
          key={sheet.editing?.id ?? "new"}
          ingredient={sheet.editing}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {textFlow?.step === "input" ? (
        <PurchaseInput
          onParsed={(items) => setTextFlow({ step: "review", items })}
          onClose={() => setTextFlow(null)}
        />
      ) : null}
      {textFlow?.step === "review" ? (
        <PurchaseReview
          items={textFlow.items}
          existing={ingredients}
          onClose={() => setTextFlow(null)}
        />
      ) : null}
    </section>
  );
}
