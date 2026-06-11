"use client";

import { useState, useTransition } from "react";

import { parsePurchaseText } from "@/app/(protected)/pantry/actions";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import type { ParsedItem } from "@/lib/ai/parse-purchase";

export function PurchaseInput({
  onParsed,
  onClose,
}: {
  onParsed: (items: ParsedItem[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function parse() {
    setError(null);
    start(async () => {
      const res = await parsePurchaseText(text);
      if (res.error || !res.items) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      onParsed(res.items);
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add pantry items by text"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <GlassCard className="relative z-10 w-full max-w-sm rounded-b-none sm:rounded-[22px]">
        <div className="space-y-3">
          <h2 className="text-lg font-extrabold">Add by text</h2>
          <div className="space-y-1">
            <label htmlFor="purchase-text" className="text-sm font-semibold">
              What did you buy?
            </label>
            <textarea
              id="purchase-text"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. 2kg potatoes, a dozen eggs, some milk"
              className="bg-card w-full rounded-lg border px-3 py-2"
            />
          </div>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" className="flex-1" disabled={pending} onClick={parse}>
              {pending ? "Parsing…" : "Parse"}
            </Button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
