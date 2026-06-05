"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTransition } from "react";

import { deleteIngredient, setAvailability } from "@/app/(protected)/pantry/actions";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import type { Ingredient } from "@/db/schema";

export function IngredientRow({
  ingredient,
  onEdit,
}: {
  ingredient: Ingredient;
  onEdit: (ingredient: Ingredient) => void;
}) {
  const [pending, start] = useTransition();

  const amount =
    ingredient.quantity != null
      ? `${ingredient.quantity}${ingredient.unit ? ` ${ingredient.unit}` : ""}`
      : (ingredient.unit ?? "");

  return (
    <GlassCard
      className={cn(
        "flex items-center gap-3 py-3",
        !ingredient.available && "opacity-50",
      )}
    >
      <button
        type="button"
        aria-label={ingredient.available ? "Mark unavailable" : "Mark available"}
        aria-pressed={ingredient.available}
        disabled={pending}
        onClick={() => start(() => setAvailability(ingredient.id, !ingredient.available))}
        className={cn(
          "size-5 shrink-0 rounded-full border-2",
          ingredient.available ? "border-primary bg-primary" : "border-muted-foreground",
        )}
      />

      <div className="min-w-0 flex-1">
        <div className="font-semibold">{ingredient.name}</div>
        {amount ? <div className="text-xs text-muted-foreground">{amount}</div> : null}
      </div>

      <Button type="button" variant="ghost" size="icon" aria-label="Edit" onClick={() => onEdit(ingredient)}>
        <Pencil className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Delete"
        disabled={pending}
        onClick={() => start(() => deleteIngredient(ingredient.id))}
      >
        <Trash2 className="size-4" />
      </Button>
    </GlassCard>
  );
}
