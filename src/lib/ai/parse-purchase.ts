import { z } from "zod";

const itemSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.preprocess(
    (v) => (v === null || v === undefined || v === "" ? undefined : v),
    z.number().nonnegative().optional(),
  ),
  unit: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined),
    z.string().optional(),
  ),
});

export interface ParsedItem {
  name: string;
  quantity?: number;
  unit?: string;
}

/** Validate the model's JSON array into clean pantry items (names/units lowercased). */
export function parsePurchaseItems(jsonText: string, limit = 30): ParsedItem[] {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const arr = Array.isArray(raw) ? raw : [];
  const out: ParsedItem[] = [];
  for (const entry of arr) {
    const parsed = itemSchema.safeParse(entry);
    if (parsed.success) {
      const item: ParsedItem = { name: parsed.data.name.toLowerCase() };
      if (parsed.data.quantity !== undefined) item.quantity = parsed.data.quantity;
      if (parsed.data.unit !== undefined) item.unit = parsed.data.unit.toLowerCase();
      out.push(item);
    }
    if (out.length >= limit) break;
  }
  return out;
}
