import type { Ingredient } from "@/db/schema";
import type { ParsedItem } from "@/lib/ai/parse-purchase";

export type MergeStatus = "new" | "merge" | "replace";

export interface ResolvedMerge {
  quantity: number | null;
  unit: string | null;
  status: MergeStatus;
}

function unitKey(u: string | null | undefined): string {
  return (u ?? "").trim().toLowerCase();
}

/**
 * Decide the final quantity/unit when an incoming purchase meets an existing
 * pantry row. Sums only when units match (null-safe, case-insensitive);
 * otherwise the incoming values replace. Shared by the review modal preview
 * and the authoritative server write.
 */
export function resolveMergedValues(
  existing: { quantity: number | null; unit: string | null } | null,
  incoming: { quantity?: number; unit?: string },
): ResolvedMerge {
  const inQty = incoming.quantity ?? null;
  const inUnit = incoming.unit ?? null;
  if (!existing) return { quantity: inQty, unit: inUnit, status: "new" };

  if (unitKey(existing.unit) === unitKey(incoming.unit)) {
    return {
      quantity: (existing.quantity ?? 0) + (incoming.quantity ?? 0),
      unit: existing.unit,
      status: "merge",
    };
  }
  return { quantity: inQty, unit: inUnit, status: "replace" };
}

export interface ReviewRow {
  name: string;
  quantity?: number;
  unit?: string;
  status: MergeStatus;
  existingQuantity?: number;
  resultingQuantity: number | null;
}

/** Annotate each parsed item with how it will land against the current pantry. */
export function mergePreview(parsed: ParsedItem[], existing: Ingredient[]): ReviewRow[] {
  const byName = new Map(existing.map((e) => [e.name.trim().toLowerCase(), e]));
  return parsed.map((item) => {
    const match = byName.get(item.name.trim().toLowerCase()) ?? null;
    const resolved = resolveMergedValues(
      match ? { quantity: match.quantity, unit: match.unit } : null,
      { quantity: item.quantity, unit: item.unit },
    );
    const row: ReviewRow = {
      name: item.name,
      status: resolved.status,
      resultingQuantity: resolved.quantity,
    };
    if (item.quantity !== undefined) row.quantity = item.quantity;
    if (item.unit !== undefined) row.unit = item.unit;
    if (match?.quantity != null) row.existingQuantity = match.quantity;
    return row;
  });
}
