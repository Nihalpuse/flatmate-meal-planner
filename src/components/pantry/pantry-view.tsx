"use client";

import { Plus, Search } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { filterIngredients } from "@/lib/pantry/filter";
import type { Ingredient } from "@/types/database";

import { IngredientRow } from "./ingredient-row";
import { IngredientSheet } from "./ingredient-sheet";

export function PantryView({ ingredients }: { ingredients: Ingredient[] }) {
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<{ editing: Ingredient | null } | null>(null);

  const visible = filterIngredients(ingredients, query);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Pantry</h1>
        <Button onClick={() => setSheet({ editing: null })}>
          <Plus className="size-4" /> Add
        </Button>
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
    </section>
  );
}
