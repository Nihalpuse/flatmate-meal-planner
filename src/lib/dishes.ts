import { asc, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/db";
import { dishes } from "@/db/schema";

/** Cache tag for the dish catalog. Invalidate after any write to `dishes`. */
export const DISHES_TAG = "dishes";

export interface DishHit {
  id: string;
  name: string;
}

/** Case-insensitive substring search over the catalog. Empty query -> []. */
export async function searchDishes(query: string, limit = 8): Promise<DishHit[]> {
  const q = query.trim();
  if (!q) return [];
  const pattern = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  return db
    .select({ id: dishes.id, name: dishes.name })
    .from(dishes)
    .where(sql`lower(${dishes.name}) like lower(${pattern})`)
    .orderBy(asc(dishes.name))
    .limit(limit);
}

/**
 * searchDishes behind the Next data cache.
 *
 * The catalog is global and append-only, but the combobox queries it on every
 * keystroke (debounced 250ms) for every user, so the same handful of prefixes
 * get hit constantly. Keyed on the normalized query; dropped by DISHES_TAG when
 * a new dish is added.
 */
export const searchDishesCached = unstable_cache(
  async (query: string): Promise<DishHit[]> => searchDishes(query),
  ["dish-search"],
  { tags: [DISHES_TAG], revalidate: 3600 },
);

/** Exact (case-insensitive) catalog lookup. Lets callers skip the AI for a known dish. */
export async function findDishByName(name: string): Promise<DishHit | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const [hit] = await db
    .select({ id: dishes.id, name: dishes.name })
    .from(dishes)
    .where(sql`lower(${dishes.name}) = lower(${trimmed})`)
    .limit(1);
  return hit ?? null;
}

/** Insert an AI-sourced dish (idempotent by lower(name)); return its id. */
export async function upsertAiDish(
  name: string,
  requiredIngredients: string[],
): Promise<{ id: string }> {
  const trimmed = name.trim();
  const inserted = await db
    .insert(dishes)
    .values({ name: trimmed, requiredIngredients, source: "ai" })
    .onConflictDoNothing()
    .returning({ id: dishes.id });
  if (inserted.length > 0) return inserted[0];

  const [existing] = await db
    .select({ id: dishes.id })
    .from(dishes)
    .where(sql`lower(${dishes.name}) = lower(${trimmed})`)
    .limit(1);
  return { id: existing.id };
}
