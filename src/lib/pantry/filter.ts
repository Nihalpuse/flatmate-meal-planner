import type { Ingredient } from "@/types/database";

/** Case-insensitive substring match on ingredient name. */
export function filterIngredients(items: Ingredient[], query: string): Ingredient[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.name.toLowerCase().includes(q));
}
