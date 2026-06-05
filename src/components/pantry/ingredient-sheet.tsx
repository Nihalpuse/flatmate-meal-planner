"use client";

import { useActionState, useEffect, useRef } from "react";

import { saveIngredient, type PantryState } from "@/app/(protected)/pantry/actions";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import type { Ingredient } from "@/types/database";

const initial: PantryState = {};

/**
 * Add/edit ingredient modal. Mount it to open; the parent unmounts it to close.
 * Use a `key` (e.g. ingredient id) so fields reset between opens.
 */
export function IngredientSheet({
  ingredient,
  onClose,
}: {
  ingredient: Ingredient | null;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveIngredient, initial);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && state.ok) onClose();
    wasPending.current = pending;
  }, [pending, state.ok, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ingredient ? "Edit ingredient" : "Add ingredient"}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <GlassCard className="relative z-10 w-full max-w-sm rounded-b-none sm:rounded-[22px]">
        <form action={formAction} className="space-y-3">
          <h2 className="text-lg font-extrabold">
            {ingredient ? "Edit ingredient" : "Add ingredient"}
          </h2>
          {ingredient ? <input type="hidden" name="id" value={ingredient.id} /> : null}

          <div className="space-y-1">
            <label htmlFor="name" className="text-sm font-semibold">Name</label>
            <input
              id="name" name="name" required defaultValue={ingredient?.name ?? ""}
              className="w-full rounded-lg border bg-card px-3 py-2"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label htmlFor="quantity" className="text-sm font-semibold">Quantity</label>
              <input
                id="quantity" name="quantity" type="number" min="0" step="any"
                defaultValue={ingredient?.quantity ?? ""}
                className="w-full rounded-lg border bg-card px-3 py-2"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label htmlFor="unit" className="text-sm font-semibold">Unit</label>
              <input
                id="unit" name="unit" placeholder="kg, pcs…"
                defaultValue={ingredient?.unit ?? ""}
                className="w-full rounded-lg border bg-card px-3 py-2"
              />
            </div>
          </div>

          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
