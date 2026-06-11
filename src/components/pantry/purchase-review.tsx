"use client";

import { Minus, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { addPurchasedItems } from "@/app/(protected)/pantry/actions";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import type { ParsedItem } from "@/lib/ai/parse-purchase";
import { mergePreview } from "@/lib/pantry/merge";
import type { Ingredient } from "@/db/schema";

const WEIGHT_VOLUME = new Set(["kg", "g", "l", "ml"]);
function stepFor(unit?: string): number {
  return unit && WEIGHT_VOLUME.has(unit.trim().toLowerCase()) ? 0.5 : 1;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function PurchaseReview({
  items,
  existing,
  onClose,
}: {
  items: ParsedItem[];
  existing: Ingredient[];
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ParsedItem[]>(items);
  const [pending, start] = useTransition();
  const preview = mergePreview(rows, existing);

  function update(i: number, patch: Partial<ParsedItem>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function step(i: number, dir: 1 | -1) {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        const next = round(Math.max(0, (r.quantity ?? 0) + dir * stepFor(r.unit)));
        return { ...r, quantity: next };
      }),
    );
  }

  function confirm() {
    start(async () => {
      const res = await addPurchasedItems(rows);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Added to pantry");
        onClose();
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review purchased items"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <GlassCard className="relative z-10 flex max-h-[85vh] w-full max-w-sm flex-col rounded-b-none sm:rounded-[22px]">
        <h2 className="text-lg font-extrabold">Review items</h2>

        {rows.length === 0 ? (
          <p className="text-muted-foreground py-6 text-sm">No items left to add.</p>
        ) : (
          <ul className="my-3 flex-1 space-y-2 overflow-y-auto">
            {rows.map((row, i) => {
              const flag = preview[i];
              return (
                <li key={i} data-testid={`review-row-${i}`} className="rounded-lg border p-2">
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="Name"
                      value={row.name}
                      onChange={(e) => update(i, { name: e.target.value })}
                      className="bg-card min-w-0 flex-1 rounded-md border px-2 py-1 text-sm font-semibold"
                    />
                    <button
                      type="button"
                      aria-label="Remove item"
                      onClick={() => remove(i)}
                      className="text-muted-foreground shrink-0"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label="Decrease quantity"
                      onClick={() => step(i, -1)}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <input
                      aria-label="Quantity"
                      type="number"
                      min="0"
                      step="any"
                      value={row.quantity ?? ""}
                      onChange={(e) =>
                        update(i, {
                          quantity: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                      className="bg-card w-16 rounded-md border px-2 py-1 text-center text-sm"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label="Increase quantity"
                      onClick={() => step(i, 1)}
                    >
                      <Plus className="size-4" />
                    </Button>
                    <input
                      aria-label="Unit"
                      value={row.unit ?? ""}
                      placeholder="unit"
                      onChange={(e) => update(i, { unit: e.target.value || undefined })}
                      className="bg-card w-16 rounded-md border px-2 py-1 text-sm"
                    />
                  </div>

                  <p className="text-muted-foreground mt-1 text-xs">
                    {flag.status === "new"
                      ? "New item"
                      : flag.status === "merge"
                        ? `Have ${flag.existingQuantity ?? 0} → ${flag.resultingQuantity}`
                        : "Replaces current stock"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={pending || rows.length === 0}
            onClick={confirm}
          >
            {pending ? "Adding…" : "Add to pantry"}
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
