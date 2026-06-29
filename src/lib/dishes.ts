import { asc, sql } from "drizzle-orm";

import { db } from "@/db";
import { dishes } from "@/db/schema";

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
