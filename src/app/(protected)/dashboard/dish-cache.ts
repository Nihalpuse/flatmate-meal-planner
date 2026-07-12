import { unstable_cache } from "next/cache";

import { searchDishes, type DishHit } from "@/lib/dishes";

/**
 * Next's data cache in front of the dish catalog.
 *
 * Deliberately lives here rather than in lib/dishes.ts: lib/ is the data layer and
 * stays free of framework imports, so it can be reused from anywhere (a route
 * handler, a separate API service, a script) without dragging Next along. Caching
 * is a delivery concern, so it belongs next to the action that delivers.
 */

/** Cache tag for the catalog. Expire it after any write to `dishes`. */
export const DISHES_TAG = "dishes";

/**
 * The catalog is global and append-only, but the combobox queries it on every
 * keystroke (debounced 250ms) for every user, so the same handful of prefixes get
 * hit constantly. Keyed on the normalized query; dropped by DISHES_TAG on write.
 */
export const searchDishesCached = unstable_cache(
  async (query: string): Promise<DishHit[]> => searchDishes(query),
  ["dish-search"],
  { tags: [DISHES_TAG], revalidate: 3600 },
);
