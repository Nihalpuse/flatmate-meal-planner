import { z } from "zod";

const suggestionSchema = z.object({
  mealName: z.string().trim().min(1),
  requiredIngredients: z.array(z.string().trim().min(1)).default([]),
});

export interface Suggestion {
  mealName: string;
  requiredIngredients: string[];
}

export function parseSuggestions(jsonText: string, limit = 5): Suggestion[] {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const arr = Array.isArray(raw) ? raw : [];
  const out: Suggestion[] = [];
  for (const item of arr) {
    const parsed = suggestionSchema.safeParse(item);
    if (parsed.success) {
      out.push({
        mealName: parsed.data.mealName,
        requiredIngredients: parsed.data.requiredIngredients.map((s) => s.toLowerCase()),
      });
    }
    if (out.length >= limit) break;
  }
  return out;
}
