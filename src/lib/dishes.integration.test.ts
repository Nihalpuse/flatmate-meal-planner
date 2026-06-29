// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dishes } from "@/db/schema";
import { searchDishes, upsertAiDish } from "./dishes";

beforeEach(async () => {
  await db.delete(dishes);
  await db.insert(dishes).values([
    { name: "Egg Fried Rice", requiredIngredients: ["egg", "rice"], source: "seed" },
    { name: "Paneer Butter Masala", requiredIngredients: ["paneer"], source: "seed" },
  ]);
});

test("searchDishes matches case-insensitive substring", async () => {
  const hits = await searchDishes("RICE");
  expect(hits.map((h) => h.name)).toEqual(["Egg Fried Rice"]);
});

test("searchDishes returns empty for blank query", async () => {
  expect(await searchDishes("   ")).toEqual([]);
});

test("upsertAiDish inserts once and is idempotent by lower(name)", async () => {
  const a = await upsertAiDish("Veg Maggi", ["maggi", "onion"]);
  const b = await upsertAiDish("veg maggi", ["maggi"]);
  expect(a.id).toBe(b.id);
  const rows = await db.select().from(dishes).where(eq(dishes.source, "ai"));
  expect(rows).toHaveLength(1);
  expect(rows[0].requiredIngredients).toEqual(["maggi", "onion"]);
});
