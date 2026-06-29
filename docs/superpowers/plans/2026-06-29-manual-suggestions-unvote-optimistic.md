# Manual Suggestions + Unvote + Optimistic Voting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let members add a meal to a session from a seeded dish catalog (with an AI fallback that enriches + saves the dish), remove their own (or admin-remove any) suggestion, unvote/abstain, and make vote taps feel instant via optimistic UI.

**Architecture:** A new global `dishes` catalog table backs catalog search + an AI fallback that upserts dishes. Manual suggestions append non-destructively (`aiGenerated:false`, `addedBy`), survive AI regenerate (which now deletes only AI rows), and can be removed (admin or author) without touching the catalog. Voting gains `clearVoteForUser` (unvote) and the dashboard wraps vote state in `useOptimistic` for instant taps. Pure/DB logic lives in `src/lib/*` (PGlite integration-tested); thin `"use server"` wrappers do auth + group resolution.

**Tech Stack:** Next.js 16 App Router (server actions, server components), Drizzle ORM + Neon, zod v4, Gemini (`generateJson`), React 19 `useOptimistic`/`useTransition`, Vitest + Testing Library + PGlite.

## Global Constraints

- Manual add allowed only while session status is `open` or `voting`; `finalized`/`cancelled` → "Voting is closed".
- Regenerate (`replaceSuggestions`) deletes ONLY `aiGenerated = true` rows.
- Remove deletes only the `meal_suggestions` row; the `dishes` catalog row is never deleted. Allowed if `isAdmin || suggestion.addedBy === userId`.
- `dishes` is global (not group-scoped); names are case-insensitively unique.
- Per-session suggestion cap = 15. Dedup by `lower(name)` within a session.
- AI fallback rate-limited: `rateLimit(\`dish-ai:\${userId}\`, 20, 60_000)`.
- Em-dashes: none in any user-facing copy. Run a single test with `npx vitest run <path>`; full suite `npm test`; `npm run typecheck`. Commit after each task. Branch `manual-suggestions` (already created; spec committed there).

**Shared signatures (threaded across tasks):**
- `src/lib/dishes.ts`: `searchDishes(query: string): Promise<DishHit[]>` where `DishHit = { id: string; name: string }`; `upsertAiDish(name: string, requiredIngredients: string[]): Promise<{ id: string }>`.
- `src/lib/ai/gemini.ts`: `parseDish(name: string): Promise<string[]>` (lowercased ingredient names).
- `src/lib/suggestions.ts`: `MANUAL_SUGGESTION_CAP = 15`; `addCatalogSuggestion(userId, groupId, sessionId, dishId): Promise<string | null>`; `removeSuggestion(userId, groupId, isAdmin, sessionId, suggestionId): Promise<string | null>`.
- `src/lib/votes.ts`: `SuggestionVote` gains `addedBy: string | null`; `clearVoteForUser(userId, groupId, sessionId): Promise<string | null>`.

---

### Task 1: Schema — `dishes` table, suggestion columns, migration + seed

**Files:**
- Modify: `src/db/schema.ts`
- Create (generated): `drizzle/0003_*.sql` (append seed inserts)

**Interfaces:**
- Produces: `dishes` table + `dishSource` enum; `mealSuggestions.addedBy` (text, nullable, FK users) and `mealSuggestions.dishId` (uuid, nullable, FK dishes); inferred type `Dish`.

- [ ] **Step 1: Edit `src/db/schema.ts`** — add the enum + table after the `mealSuggestions` table definition (all imports `pgEnum`, `jsonb`, `uuid`, `text`, `timestamp`, `uniqueIndex`, `sql` already present):

```ts
export const dishSource = pgEnum("dish_source", ["seed", "ai"]);

export const dishes = pgTable(
  "dishes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    requiredIngredients: jsonb("required_ingredients")
      .$type<string[]>()
      .notNull()
      .default([]),
    source: dishSource("source").notNull().default("seed"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("dishes_lower_name_idx").on(sql`lower(${t.name})`)],
);

export type Dish = typeof dishes.$inferSelect;
```

In the `mealSuggestions` table object, add two columns (after `requiredIngredients`):

```ts
    addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
    dishId: uuid("dish_id").references(() => dishes.id),
```

Note: `dishId` references `dishes`, so the `dishes` const must be declared **before** `mealSuggestions`, OR use a thunk. Drizzle's `.references(() => dishes.id)` is already a thunk, so declaration order does not matter at runtime — keep `dishes` where written.

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: `drizzle/0003_<name>.sql` with `CREATE TYPE "dish_source"`, `CREATE TABLE "dishes"`, the unique index, and two `ALTER TABLE "meal_suggestions" ADD COLUMN`.

- [ ] **Step 3: Append the dish seed to the generated `drizzle/0003_<name>.sql`**

Add at the end of that file:

```sql
--> statement-breakpoint
INSERT INTO "dishes" ("name", "required_ingredients", "source") VALUES
  ('Egg Fried Rice', '["egg","rice","onion","soy sauce"]', 'seed'),
  ('Aloo Jeera', '["potato","cumin","oil"]', 'seed'),
  ('Rajma Chawal', '["rajma","rice","onion","tomato"]', 'seed'),
  ('Chole', '["chickpeas","onion","tomato","ginger"]', 'seed'),
  ('Paneer Butter Masala', '["paneer","tomato","cream","butter"]', 'seed'),
  ('Palak Paneer', '["paneer","spinach","onion","garlic"]', 'seed'),
  ('Dal Tadka', '["toor dal","onion","tomato","cumin"]', 'seed'),
  ('Dal Makhani', '["urad dal","rajma","cream","butter"]', 'seed'),
  ('Veg Pulao', '["rice","mixed vegetables","onion","whole spices"]', 'seed'),
  ('Jeera Rice', '["rice","cumin","oil"]', 'seed'),
  ('Aloo Gobi', '["potato","cauliflower","onion","turmeric"]', 'seed'),
  ('Bhindi Masala', '["okra","onion","tomato"]', 'seed'),
  ('Egg Curry', '["egg","onion","tomato","ginger"]', 'seed'),
  ('Chicken Curry', '["chicken","onion","tomato","ginger garlic"]', 'seed'),
  ('Butter Chicken', '["chicken","tomato","cream","butter"]', 'seed'),
  ('Veg Biryani', '["rice","mixed vegetables","yogurt","whole spices"]', 'seed'),
  ('Chicken Biryani', '["chicken","rice","yogurt","whole spices"]', 'seed'),
  ('Masala Dosa', '["dosa batter","potato","onion"]', 'seed'),
  ('Idli Sambar', '["idli batter","toor dal","mixed vegetables"]', 'seed'),
  ('Poha', '["flattened rice","onion","peanuts","mustard seeds"]', 'seed'),
  ('Upma', '["semolina","onion","mustard seeds"]', 'seed'),
  ('Maggi', '["maggi noodles","onion"]', 'seed'),
  ('Veg Fried Rice', '["rice","mixed vegetables","soy sauce"]', 'seed'),
  ('Veg Hakka Noodles', '["noodles","mixed vegetables","soy sauce"]', 'seed'),
  ('Pav Bhaji', '["pav","potato","mixed vegetables","butter"]', 'seed'),
  ('Chana Masala', '["chickpeas","onion","tomato"]', 'seed'),
  ('Kadhi Chawal', '["yogurt","gram flour","rice"]', 'seed'),
  ('Matar Paneer', '["paneer","peas","tomato","onion"]', 'seed'),
  ('Veg Khichdi', '["rice","moong dal","mixed vegetables"]', 'seed'),
  ('Roti Sabzi', '["wheat flour","mixed vegetables","onion"]', 'seed'),
  ('Lemon Rice', '["rice","lemon","peanuts","curry leaves"]', 'seed'),
  ('Curd Rice', '["rice","yogurt","curry leaves"]', 'seed'),
  ('Pasta', '["pasta","tomato","onion","cheese"]', 'seed'),
  ('Veg Sandwich', '["bread","potato","onion","tomato"]', 'seed'),
  ('Omelette', '["egg","onion","green chilli"]', 'seed'),
  ('Sambar Rice', '["rice","toor dal","mixed vegetables","tamarind"]', 'seed')
ON CONFLICT (lower(name)) DO NOTHING;
```

- [ ] **Step 4: Apply migration**

Run: `npm run db:migrate`
Expected: completes; `dishes` populated.

> If blocked by remote-DB permissions, STOP and ask the user to run `npm run db:migrate`, then continue. (PGlite tests apply this migration locally regardless.)

- [ ] **Step 5: Fix the dashboard test fixture for the widened suggestion shape**

In `src/components/dashboard/dashboard-view.test.tsx`, the `sv(...)` helper builds suggestion objects. Add `addedBy: null` to its returned object so it satisfies the `SuggestionVote` type that gains `addedBy` in Task 5 (do it now to avoid a mid-plan type break):

```ts
const sv = (id: string, name: string, req: string[], votes: number, mine = false) => ({
  id, mealName: name, requiredIngredients: req, votes, mine, addedBy: null as string | null,
});
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: dishes catalog table + suggestion addedBy/dishId columns + seed"
```

---

### Task 2: `dishes` lib — search + AI upsert

**Files:**
- Create: `src/lib/dishes.ts`
- Create: `src/lib/dishes.integration.test.ts`

**Interfaces:**
- Consumes: `dishes` table (Task 1).
- Produces: `searchDishes(query: string): Promise<{ id: string; name: string }[]>`; `upsertAiDish(name: string, requiredIngredients: string[]): Promise<{ id: string }>`.

- [ ] **Step 1: Write failing tests** — `src/lib/dishes.integration.test.ts`

```ts
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
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/lib/dishes.integration.test.ts`, module missing).

- [ ] **Step 3: Implement `src/lib/dishes.ts`**

```ts
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
  const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
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
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/lib/dishes.ts src/lib/dishes.integration.test.ts
git commit -m "feat: dish catalog search + AI upsert"
```

---

### Task 3: AI `parseDish` — prompt + parser + client

**Files:**
- Create: `src/lib/ai/dish-prompt.ts`, `src/lib/ai/dish-prompt.test.ts`
- Create: `src/lib/ai/parse-dish.ts`, `src/lib/ai/parse-dish.test.ts`
- Modify: `src/lib/ai/gemini.ts`

**Interfaces:**
- Consumes: `generateJson` (private in `gemini.ts`).
- Produces: `buildDishPrompt(name: string): string`; `parseDishIngredients(jsonText: string): string[]`; `parseDish(name: string): Promise<string[]>`.

- [ ] **Step 1: Failing prompt test** — `src/lib/ai/dish-prompt.test.ts`

```ts
import { expect, test } from "vitest";

import { buildDishPrompt } from "./dish-prompt";

test("includes the dish name and asks for lowercase ingredient list", () => {
  const p = buildDishPrompt("Paneer Tikka");
  expect(p).toContain("Paneer Tikka");
  expect(p).toMatch(/lowercase/i);
  expect(p).toMatch(/ingredient/i);
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `src/lib/ai/dish-prompt.ts`**

```ts
export function buildDishPrompt(name: string): string {
  return [
    "You are a cooking assistant for flatmates in India.",
    "Given a dish name, list its key required ingredients.",
    "Rules:",
    "- Return simple lowercase ingredient names (e.g. \"paneer\", \"tomato\").",
    "- Include only the main ingredients (roughly 3 to 8).",
    "- Return ONLY JSON matching the requested schema.",
    `Dish: ${name}`,
  ].join("\n");
}
```

- [ ] **Step 4: Failing parser test** — `src/lib/ai/parse-dish.test.ts`

```ts
import { expect, test } from "vitest";

import { parseDishIngredients } from "./parse-dish";

test("returns lowercased trimmed names, drops blanks/dupes-of-shape", () => {
  expect(parseDishIngredients('["Paneer"," Tomato ","",null,"Cream"]')).toEqual([
    "paneer", "tomato", "cream",
  ]);
});

test("bad JSON or non-array returns empty", () => {
  expect(parseDishIngredients("nope")).toEqual([]);
  expect(parseDishIngredients('{"a":1}')).toEqual([]);
});
```

- [ ] **Step 5: Run → FAIL.**
- [ ] **Step 6: Implement `src/lib/ai/parse-dish.ts`**

```ts
/** Validate the model's JSON array of ingredient names into clean lowercase strings. */
export function parseDishIngredients(jsonText: string, limit = 12): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const v = item.trim().toLowerCase();
    if (v) out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}
```

- [ ] **Step 7: Add `parseDish` to `src/lib/ai/gemini.ts`**

Add imports next to the existing ai imports:

```ts
import { buildDishPrompt } from "./dish-prompt";
import { parseDishIngredients } from "./parse-dish";
```

Add a response schema next to `PURCHASE_SCHEMA`:

```ts
const DISH_SCHEMA = { type: "ARRAY", items: { type: "STRING" } } as const;
```

Add the exported function at the end:

```ts
/** Ask the model for a dish's key required ingredients (lowercase names). */
export async function parseDish(name: string): Promise<string[]> {
  const out = await generateJson(buildDishPrompt(name), DISH_SCHEMA);
  return parseDishIngredients(out);
}
```

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npx vitest run src/lib/ai`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/ai/dish-prompt.ts src/lib/ai/dish-prompt.test.ts src/lib/ai/parse-dish.ts src/lib/ai/parse-dish.test.ts src/lib/ai/gemini.ts
git commit -m "feat: AI dish-ingredients parsing (parseDish)"
```

---

### Task 4: `suggestions.ts` — add catalog suggestion, remove, regenerate guard

**Files:**
- Modify: `src/lib/suggestions.ts`
- Create: `src/lib/manual-suggestions.integration.test.ts`

**Interfaces:**
- Consumes: `dishes` (Task 1).
- Produces: `MANUAL_SUGGESTION_CAP`; `addCatalogSuggestion(userId, groupId, sessionId, dishId): Promise<string | null>`; `removeSuggestion(userId, groupId, isAdmin, sessionId, suggestionId): Promise<string | null>`.

- [ ] **Step 1: Write failing integration tests** — `src/lib/manual-suggestions.integration.test.ts`

```ts
// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dishes, groupMembers, groups, mealSessions, mealSuggestions, users } from "@/db/schema";
import { addCatalogSuggestion, removeSuggestion } from "./suggestions";

let groupId: string;
let sessionId: string;
let dishId: string;

beforeEach(async () => {
  await db.delete(users); // cascades groups/sessions/suggestions
  await db.delete(dishes);
  await db.insert(users).values([
    { id: "admin", email: "a@x.y" },
    { id: "m1", email: "m1@x.y" },
    { id: "m2", email: "m2@x.y" },
  ]);
  const [g] = await db.insert(groups).values({ name: "Flat", inviteCode: "AAAAAA", createdBy: "admin" }).returning({ id: groups.id });
  groupId = g.id;
  await db.insert(groupMembers).values([
    { groupId, userId: "admin", role: "admin" },
    { groupId, userId: "m1", role: "member" },
  ]);
  const [s] = await db.insert(mealSessions).values({ groupId, sessionDate: "2026-06-29", mealType: "dinner" }).returning({ id: mealSessions.id });
  sessionId = s.id;
  const [d] = await db.insert(dishes).values({ name: "Poha", requiredIngredients: ["flattened rice", "onion"], source: "seed" }).returning({ id: dishes.id });
  dishId = d.id;
});

test("adds a manual suggestion (aiGenerated false, addedBy, snapshot ingredients)", async () => {
  expect(await addCatalogSuggestion("m1", groupId, sessionId, dishId)).toBeNull();
  const [row] = await db.select().from(mealSuggestions);
  expect(row).toMatchObject({
    mealName: "Poha", aiGenerated: false, addedBy: "m1", dishId,
    requiredIngredients: ["flattened rice", "onion"],
  });
});

test("dedup by lower(name) within the session", async () => {
  await addCatalogSuggestion("m1", groupId, sessionId, dishId);
  expect(await addCatalogSuggestion("m1", groupId, sessionId, dishId)).toBe("Already suggested");
});

test("blocked when finalized", async () => {
  await db.update(mealSessions).set({ status: "finalized" }).where(eq(mealSessions.id, sessionId));
  expect(await addCatalogSuggestion("m1", groupId, sessionId, dishId)).toBe("Voting is closed");
});

test("author can remove, catalog dish survives; votes table row gone", async () => {
  await addCatalogSuggestion("m1", groupId, sessionId, dishId);
  const [sug] = await db.select().from(mealSuggestions);
  expect(await removeSuggestion("m1", groupId, false, sessionId, sug.id)).toBeNull();
  expect(await db.select().from(mealSuggestions)).toHaveLength(0);
  expect(await db.select().from(dishes).where(eq(dishes.id, dishId))).toHaveLength(1);
});

test("non-author non-admin cannot remove", async () => {
  await addCatalogSuggestion("m1", groupId, sessionId, dishId);
  const [sug] = await db.select().from(mealSuggestions);
  expect(await removeSuggestion("m2", groupId, false, sessionId, sug.id)).toBe(
    "You can only remove suggestions you added",
  );
});

test("admin can remove anyone's suggestion", async () => {
  await addCatalogSuggestion("m1", groupId, sessionId, dishId);
  const [sug] = await db.select().from(mealSuggestions);
  expect(await removeSuggestion("admin", groupId, true, sessionId, sug.id)).toBeNull();
});

test("regenerate (replaceSuggestions) keeps manual rows, replaces AI ones", async () => {
  const { replaceSuggestions } = await import("./suggestions");
  await db.insert(mealSuggestions).values({ sessionId, mealName: "AI Dish", requiredIngredients: [], aiGenerated: true });
  await addCatalogSuggestion("m1", groupId, sessionId, dishId);
  const err = await replaceSuggestions(sessionId, [{ mealName: "New AI", requiredIngredients: [] }]);
  expect(err).toBeNull();
  const names = (await db.select().from(mealSuggestions).where(eq(mealSuggestions.sessionId, sessionId))).map((r) => r.mealName).sort();
  expect(names).toEqual(["New AI", "Poha"]);
});
```

- [ ] **Step 2: Run → FAIL** (`addCatalogSuggestion`/`removeSuggestion` missing; regenerate test fails because replace still deletes all).

- [ ] **Step 3: Edit `replaceSuggestions` in `src/lib/suggestions.ts`** — guard the delete to AI rows only:

Change the delete line inside the transaction from:

```ts
    await tx.delete(mealSuggestions).where(eq(mealSuggestions.sessionId, sessionId));
```

to:

```ts
    await tx
      .delete(mealSuggestions)
      .where(
        and(
          eq(mealSuggestions.sessionId, sessionId),
          eq(mealSuggestions.aiGenerated, true),
        ),
      );
```

(`and` is already imported in this file.)

- [ ] **Step 4: Append the new functions to `src/lib/suggestions.ts`**

Add imports at the top: `dishes`, `votes` are NOT needed; add `dishes` to the `@/db/schema` import and `sql` is already imported. Add:

```ts
import { dishes } from "@/db/schema";
```

Append:

```ts
export const MANUAL_SUGGESTION_CAP = 15;

/** Append a single manual suggestion from a catalog dish. Error string or null. */
export async function addCatalogSuggestion(
  userId: string,
  groupId: string,
  sessionId: string,
  dishId: string,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(mealSessions)
      .where(and(eq(mealSessions.id, sessionId), eq(mealSessions.groupId, groupId)))
      .limit(1)
      .for("update");
    if (!session) return "Session not found";
    if (session.status === "finalized" || session.status === "cancelled") {
      return "Voting is closed";
    }

    const [dish] = await tx
      .select()
      .from(dishes)
      .where(eq(dishes.id, dishId))
      .limit(1);
    if (!dish) return "Dish not found";

    const existing = await tx
      .select({ id: mealSuggestions.id, mealName: mealSuggestions.mealName })
      .from(mealSuggestions)
      .where(eq(mealSuggestions.sessionId, sessionId));
    if (existing.length >= MANUAL_SUGGESTION_CAP) {
      return "This session already has the maximum number of suggestions";
    }
    const dup = existing.some(
      (e) => e.mealName.trim().toLowerCase() === dish.name.trim().toLowerCase(),
    );
    if (dup) return "Already suggested";

    await tx.insert(mealSuggestions).values({
      sessionId,
      mealName: dish.name,
      requiredIngredients: dish.requiredIngredients,
      aiGenerated: false,
      addedBy: userId,
      dishId: dish.id,
    });
    return null;
  });
}

/** Remove a suggestion from the session (admin or author). Catalog dish untouched. */
export async function removeSuggestion(
  userId: string,
  groupId: string,
  isAdmin: boolean,
  sessionId: string,
  suggestionId: string,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(mealSessions)
      .where(and(eq(mealSessions.id, sessionId), eq(mealSessions.groupId, groupId)))
      .limit(1)
      .for("update");
    if (!session) return "Session not found";
    if (session.status === "finalized") return "Voting is closed";

    const [sug] = await tx
      .select({ id: mealSuggestions.id, addedBy: mealSuggestions.addedBy })
      .from(mealSuggestions)
      .where(and(eq(mealSuggestions.id, suggestionId), eq(mealSuggestions.sessionId, sessionId)))
      .limit(1);
    if (!sug) return "Suggestion not found";
    if (!isAdmin && sug.addedBy !== userId) {
      return "You can only remove suggestions you added";
    }

    await tx.delete(mealSuggestions).where(eq(mealSuggestions.id, suggestionId));
    return null;
  });
}
```

- [ ] **Step 5: Run → PASS** (`npx vitest run src/lib/manual-suggestions.integration.test.ts src/lib/suggestions.integration.test.ts`). The existing suggestions integration test still passes (regenerate of an all-AI list behaves the same).

- [ ] **Step 6: Commit**

```bash
git add src/lib/suggestions.ts src/lib/manual-suggestions.integration.test.ts
git commit -m "feat: add/remove manual suggestions; regenerate keeps manual rows"
```

---

### Task 5: `votes.ts` — unvote + addedBy in vote state

**Files:**
- Modify: `src/lib/votes.ts`
- Modify: `src/lib/vote-state.test.ts`
- Create: `src/lib/clear-vote.integration.test.ts`

**Interfaces:**
- Produces: `SuggestionVote.addedBy: string | null`; `clearVoteForUser(userId, groupId, sessionId): Promise<string | null>`.
- Consumed by: dashboard (Task 7-9), vote actions (Task 6).

- [ ] **Step 1: Extend the pure builder test** — in `src/lib/vote-state.test.ts`, update the `sug` helper and assertions to include `addedBy`:

```ts
const sug = (id: string, sessionId: string, name: string, addedBy: string | null = null) => ({
  id, sessionId, mealName: name, requiredIngredients: [] as string[], addedBy,
});
```

Add an assertion in the first test after the existing ones:

```ts
  expect(s1.suggestions.find((s) => s.id === "a")).toMatchObject({ addedBy: null });
```

- [ ] **Step 2: Write failing unvote integration test** — `src/lib/clear-vote.integration.test.ts`

```ts
// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { groupMembers, groups, mealSessions, mealSuggestions, users, votes } from "@/db/schema";
import { castVoteForUser, clearVoteForUser } from "./votes";

let groupId: string;
let sessionId: string;
let sugId: string;

beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values([{ id: "m1", email: "m1@x.y" }, { id: "m2", email: "m2@x.y" }]);
  const [g] = await db.insert(groups).values({ name: "F", inviteCode: "BBBBBB", createdBy: "m1" }).returning({ id: groups.id });
  groupId = g.id;
  await db.insert(groupMembers).values([{ groupId, userId: "m1", role: "admin" }, { groupId, userId: "m2", role: "member" }]);
  const [s] = await db.insert(mealSessions).values({ groupId, sessionDate: "2026-06-29", mealType: "lunch" }).returning({ id: mealSessions.id });
  sessionId = s.id;
  const [sug] = await db.insert(mealSuggestions).values({ sessionId, mealName: "Poha", requiredIngredients: [] }).returning({ id: mealSuggestions.id });
  sugId = sug.id;
});

test("clears only the caller's vote", async () => {
  await castVoteForUser("m1", groupId, sessionId, sugId);
  await castVoteForUser("m2", groupId, sessionId, sugId);
  expect(await clearVoteForUser("m1", groupId, sessionId)).toBeNull();
  const rows = await db.select().from(votes).where(eq(votes.sessionId, sessionId));
  expect(rows.map((r) => r.userId)).toEqual(["m2"]);
});

test("no-op when caller has no vote", async () => {
  expect(await clearVoteForUser("m1", groupId, sessionId)).toBeNull();
});

test("blocked once finalized", async () => {
  await castVoteForUser("m1", groupId, sessionId, sugId);
  await db.update(mealSessions).set({ status: "finalized" }).where(eq(mealSessions.id, sessionId));
  expect(await clearVoteForUser("m1", groupId, sessionId)).toBe("Voting is closed");
});
```

- [ ] **Step 3: Run both → FAIL** (`addedBy` missing on type; `clearVoteForUser` missing).

- [ ] **Step 4: Implement in `src/lib/votes.ts`**

(a) Add `addedBy` to `SuggestionVote`:

```ts
export interface SuggestionVote {
  id: string;
  mealName: string;
  requiredIngredients: string[];
  votes: number;
  mine: boolean;
  addedBy: string | null;
}
```

(b) In `buildVoteState`, widen the `suggestions` param type and pass `addedBy` through:

```ts
  suggestions: {
    id: string;
    sessionId: string;
    mealName: string;
    requiredIngredients: string[];
    addedBy: string | null;
  }[],
```

and in the push:

```ts
    state.get(sug.sessionId)?.suggestions.push({
      id: sug.id,
      mealName: sug.mealName,
      requiredIngredients: sug.requiredIngredients,
      votes: counts.get(sug.id) ?? 0,
      mine: mine.has(sug.id),
      addedBy: sug.addedBy,
    });
```

(`getVoteStateForSessions` already does `db.select().from(mealSuggestions)` (full rows), so `addedBy` is present — no query change needed.)

(c) Append `clearVoteForUser` (after `castVoteForUser`):

```ts
/** Remove the caller's own vote for a session (unvote). Error string or null. */
export async function clearVoteForUser(
  userId: string,
  groupId: string,
  sessionId: string,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(mealSessions)
      .where(and(eq(mealSessions.id, sessionId), eq(mealSessions.groupId, groupId)))
      .limit(1)
      .for("update");
    if (!session) return "Session not found";
    if (session.status === "finalized") return "Voting is closed";
    await tx
      .delete(votes)
      .where(and(eq(votes.sessionId, sessionId), eq(votes.userId, userId)));
    return null;
  });
}
```

- [ ] **Step 5: Run → PASS** (`npx vitest run src/lib/clear-vote.integration.test.ts src/lib/vote-state.test.ts src/lib/votes.integration.test.ts`).

- [ ] **Step 6: Verify typecheck** (`npm run typecheck`) — `SuggestionVote.addedBy` now required; the Task 1 fixture fix keeps the dashboard test green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/votes.ts src/lib/vote-state.test.ts src/lib/clear-vote.integration.test.ts
git commit -m "feat: unvote (clearVoteForUser) + addedBy in vote state"
```

---

### Task 6: Server actions — clearVote + suggestion actions

**Files:**
- Modify: `src/app/(protected)/dashboard/vote-actions.ts`
- Create: `src/app/(protected)/dashboard/suggestion-actions.ts`

**Interfaces:**
- Consumes: `clearVoteForUser` (Task 5), `searchDishes`/`upsertAiDish` (Task 2), `parseDish` (Task 3), `addCatalogSuggestion`/`removeSuggestion` (Task 4), `getGroupContext` (existing), `rateLimit` (existing).
- Produces: `clearVote(sessionId): Promise<VoteState>`; `searchDishesAction(query): Promise<DishHit[]>`; `addSuggestionFromCatalog(sessionId, dishId): Promise<{error?: string}>`; `addSuggestionWithAI(sessionId, name): Promise<{error?: string}>`; `removeSuggestionFromSession(sessionId, suggestionId): Promise<{error?: string}>`.

- [ ] **Step 1: Add `clearVote` to `vote-actions.ts`**

Add `clearVoteForUser` to the import from `@/lib/votes`, then append:

```ts
export async function clearVote(sessionId: string): Promise<VoteState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const group = await getGroupContext(session.user.id);
  if (!group) redirect("/onboarding");

  const error = await clearVoteForUser(session.user.id, group.id, sessionId);
  if (error) return { error };
  revalidatePath("/dashboard");
  return {};
}
```

- [ ] **Step 2: Create `src/app/(protected)/dashboard/suggestion-actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { parseDish } from "@/lib/ai/gemini";
import { searchDishes, upsertAiDish, type DishHit } from "@/lib/dishes";
import { getGroupContext } from "@/lib/groups";
import { rateLimit } from "@/lib/rate-limit";
import { addCatalogSuggestion, removeSuggestion } from "@/lib/suggestions";

export type SuggestionActionState = { error?: string };

export async function searchDishesAction(query: string): Promise<DishHit[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  return searchDishes(query);
}

export async function addSuggestionFromCatalog(
  sessionId: string,
  dishId: string,
): Promise<SuggestionActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const group = await getGroupContext(session.user.id);
  if (!group) redirect("/onboarding");

  const error = await addCatalogSuggestion(session.user.id, group.id, sessionId, dishId);
  if (error) return { error };
  revalidatePath("/dashboard");
  return {};
}

export async function addSuggestionWithAI(
  sessionId: string,
  name: string,
): Promise<SuggestionActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const group = await getGroupContext(session.user.id);
  if (!group) redirect("/onboarding");

  const trimmed = name.trim();
  if (!trimmed) return { error: "Type a dish name first." };
  if (!rateLimit(`dish-ai:${session.user.id}`, 20, 60_000)) {
    return { error: "Too many attempts. Try again in a minute." };
  }

  let ingredients: string[];
  try {
    ingredients = await parseDish(trimmed);
  } catch {
    return { error: "Could not reach the AI. Please try again." };
  }

  const dish = await upsertAiDish(trimmed, ingredients);
  const error = await addCatalogSuggestion(session.user.id, group.id, sessionId, dish.id);
  if (error) return { error };
  revalidatePath("/dashboard");
  return {};
}

export async function removeSuggestionFromSession(
  sessionId: string,
  suggestionId: string,
): Promise<SuggestionActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const group = await getGroupContext(session.user.id);
  if (!group) redirect("/onboarding");

  const error = await removeSuggestion(
    session.user.id,
    group.id,
    group.role === "admin",
    sessionId,
    suggestionId,
  );
  if (error) return { error };
  revalidatePath("/dashboard");
  return {};
}
```

- [ ] **Step 3: Verify** (`npm run typecheck`) — clean.
- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected)/dashboard/vote-actions.ts" "src/app/(protected)/dashboard/suggestion-actions.ts"
git commit -m "feat: clearVote + suggestion server actions (search/add/remove)"
```

---

### Task 7: Pass current user id into the dashboard view

**Files:**
- Modify: `src/app/(protected)/dashboard/page.tsx`
- Modify: `src/components/dashboard/dashboard-view.tsx` (props only)

**Interfaces:**
- Produces: `DashboardView` accepts `currentUserId: string`, forwarded to `SessionPanel`.

- [ ] **Step 1: Pass `currentUserId` in `page.tsx`** — the page already has `userId`. In the `<DashboardView ... />` JSX add:

```tsx
      currentUserId={userId}
```

- [ ] **Step 2: Thread the prop in `dashboard-view.tsx`** — add `currentUserId: string` to `DashboardView`'s props type and destructure it, then pass `currentUserId={currentUserId}` to `<SessionPanel ... />`. Add `currentUserId: string` to `SessionPanel`'s props type and destructure it (it is used in Task 9).

- [ ] **Step 3: Verify** (`npm run typecheck`). Expected: clean (prop is currently unused in SessionPanel body, which is fine; Task 9 uses it). If lint flags an unused var, proceed to Task 9 in the same session before committing, or prefix usage — but typecheck passes.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected)/dashboard/page.tsx" src/components/dashboard/dashboard-view.tsx
git commit -m "feat: thread currentUserId into dashboard view"
```

---

### Task 8: AddSuggestion combobox component

**Files:**
- Create: `src/components/dashboard/add-suggestion.tsx`
- Create: `src/components/dashboard/add-suggestion.test.tsx`

**Interfaces:**
- Consumes: `searchDishesAction`, `addSuggestionFromCatalog`, `addSuggestionWithAI` (Task 6).
- Produces: `AddSuggestion({ sessionId }: { sessionId: string })` client component.

- [ ] **Step 1: Write failing test** — `src/components/dashboard/add-suggestion.test.tsx`

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

const { searchDishesAction, addSuggestionFromCatalog, addSuggestionWithAI } = vi.hoisted(() => ({
  searchDishesAction: vi.fn(),
  addSuggestionFromCatalog: vi.fn().mockResolvedValue({}),
  addSuggestionWithAI: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/app/(protected)/dashboard/suggestion-actions", () => ({
  searchDishesAction, addSuggestionFromCatalog, addSuggestionWithAI,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AddSuggestion } from "./add-suggestion";

test("opens, searches, and adds a catalog match", async () => {
  searchDishesAction.mockResolvedValue([{ id: "d1", name: "Poha" }]);
  render(<AddSuggestion sessionId="s1" />);
  await userEvent.click(screen.getByRole("button", { name: /add a dish/i }));
  await userEvent.type(screen.getByRole("combobox"), "poha");
  const opt = await screen.findByRole("option", { name: /poha/i });
  await userEvent.click(opt);
  expect(addSuggestionFromCatalog).toHaveBeenCalledWith("s1", "d1");
});

test("offers AI fallback when no exact match", async () => {
  searchDishesAction.mockResolvedValue([]);
  render(<AddSuggestion sessionId="s1" />);
  await userEvent.click(screen.getByRole("button", { name: /add a dish/i }));
  await userEvent.type(screen.getByRole("combobox"), "Paneer Tikka");
  const aiRow = await screen.findByRole("option", { name: /search .*paneer tikka.* with ai/i });
  await userEvent.click(aiRow);
  expect(addSuggestionWithAI).toHaveBeenCalledWith("s1", "Paneer Tikka");
});
```

- [ ] **Step 2: Run → FAIL** (module missing).

- [ ] **Step 3: Implement `src/components/dashboard/add-suggestion.tsx`**

```tsx
"use client";

import { Plus, Search, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addSuggestionFromCatalog,
  addSuggestionWithAI,
  searchDishesAction,
} from "@/app/(protected)/dashboard/suggestion-actions";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import type { DishHit } from "@/lib/dishes";

export function AddSuggestion({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DishHit[]>([]);
  const [pending, start] = useTransition();
  const [searching, setSearching] = useState(false);

  // Debounced catalog search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await searchDishesAction(q);
      setHits(res);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const trimmed = query.trim();
  const hasExact = hits.some((h) => h.name.trim().toLowerCase() === trimmed.toLowerCase());
  const showAi = trimmed.length > 0 && !hasExact && !searching;

  function close() {
    setOpen(false);
    setQuery("");
    setHits([]);
  }

  function addCatalog(dishId: string) {
    start(async () => {
      const res = await addSuggestionFromCatalog(sessionId, dishId);
      if (res.error) toast.error(res.error);
      else close();
    });
  }

  function addAi() {
    start(async () => {
      const res = await addSuggestionWithAI(sessionId, trimmed);
      if (res.error) toast.error(res.error);
      else close();
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add a dish
      </Button>
    );
  }

  return (
    <GlassCard className="space-y-2 p-3">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <input
          role="combobox"
          aria-expanded
          aria-label="Search dishes"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a dish, or type a new one"
          className="bg-card w-full rounded-lg border py-2 pr-3 pl-9 text-sm"
        />
      </div>

      {trimmed.length > 0 ? (
        <ul role="listbox" className="max-h-56 space-y-1 overflow-y-auto">
          {hits.map((h) => (
            <li key={h.id} role="option" aria-selected={false}>
              <button
                type="button"
                disabled={pending}
                onClick={() => addCatalog(h.id)}
                className="hover:bg-muted flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold"
              >
                {h.name}
                <Plus className="text-muted-foreground size-4" />
              </button>
            </li>
          ))}
          {showAi ? (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                disabled={pending}
                onClick={addAi}
                className="hover:bg-muted text-primary flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold"
              >
                <Sparkles className="size-4" />
                Search &ldquo;{trimmed}&rdquo; with AI
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      <Button variant="ghost" size="sm" className="w-full" onClick={close}>
        Cancel
      </Button>
    </GlassCard>
  );
}
```

(`useRef` import can be dropped if unused; keep imports tight — remove `useRef` from the import line since it is not used.)

- [ ] **Step 4: Run → PASS** (`npx vitest run src/components/dashboard/add-suggestion.test.tsx`).
- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/add-suggestion.tsx src/components/dashboard/add-suggestion.test.tsx
git commit -m "feat: add-a-dish combobox with catalog search + AI fallback"
```

---

### Task 9: Dashboard view — optimistic vote/unvote, remove button, mount AddSuggestion

**Files:**
- Modify: `src/components/dashboard/dashboard-view.tsx`
- Modify: `src/components/dashboard/dashboard-view.test.tsx`

**Interfaces:**
- Consumes: `clearVote` (Task 6), `removeSuggestionFromSession` (Task 6), `AddSuggestion` (Task 8), `SuggestionVote.addedBy` (Task 5), `currentUserId` (Task 7).

- [ ] **Step 1: Write failing tests** — add to `src/components/dashboard/dashboard-view.test.tsx`

Extend the vote-actions mock and add a suggestion-actions mock near the top:

```ts
vi.mock("@/app/(protected)/dashboard/vote-actions", () => ({
  castVote: vi.fn().mockResolvedValue({}),
  clearVote: vi.fn().mockResolvedValue({}),
  finalizeSession: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/app/(protected)/dashboard/suggestion-actions", () => ({
  searchDishesAction: vi.fn().mockResolvedValue([]),
  addSuggestionFromCatalog: vi.fn().mockResolvedValue({}),
  addSuggestionWithAI: vi.fn().mockResolvedValue({}),
  removeSuggestionFromSession: vi.fn().mockResolvedValue({}),
}));
```

Import `clearVote`:

```ts
import { castVote, clearVote } from "@/app/(protected)/dashboard/vote-actions";
```

Add `currentUserId` to the shared `props` object:

```ts
const props = { available: ["rice", "egg"], isAdmin: true, memberCount: 3, currentUserId: "me", lunch, dinner };
```

Add tests:

```ts
test("tapping an unselected suggestion shows it selected immediately (optimistic)", async () => {
  render(<DashboardView {...props} />);
  const btn = screen.getByRole("button", { name: /Paneer Masala/ });
  await userEvent.click(btn);
  expect(btn).toHaveAttribute("aria-pressed", "true");
  expect(castVote).toHaveBeenCalledWith("l", "2");
});

test("tapping your selected suggestion clears the vote (optimistic + clearVote)", async () => {
  render(<DashboardView {...props} />);
  const mine = screen.getByRole("button", { name: /Egg Fried Rice/ });
  expect(mine).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(mine);
  expect(mine).toHaveAttribute("aria-pressed", "false");
  expect(clearVote).toHaveBeenCalledWith("l");
});

test("shows remove on a suggestion the current user added", () => {
  const withMineAdded = {
    ...props,
    currentUserId: "me",
    lunch: {
      ...lunch,
      suggestions: [
        { ...sv("1", "Egg Fried Rice", ["egg", "rice"], 2, true), addedBy: "me" },
        sv("2", "Paneer Masala", ["paneer"], 0),
      ],
    },
  };
  render(<DashboardView {...withMineAdded} />);
  expect(screen.getByRole("button", { name: /remove Egg Fried Rice/i })).toBeInTheDocument();
});
```

(The vote-button accessible name comes from the meal text; ensure the remove button has `aria-label={`Remove ${mealName}`}` so the queries above resolve.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement in `src/components/dashboard/dashboard-view.tsx`**

(a) Update imports:

```tsx
import { Plus, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { generateSuggestions } from "@/app/(protected)/dashboard/actions";
import { castVote, clearVote, finalizeSession } from "@/app/(protected)/dashboard/vote-actions";
import { removeSuggestionFromSession } from "@/app/(protected)/dashboard/suggestion-actions";
import { AddSuggestion } from "@/components/dashboard/add-suggestion";
```

(`Plus` import is optional; remove if unused. Keep `Sparkles`, `X`.)

(b) Thread `currentUserId` (Task 7 already added the prop types). In `SessionPanel`, replace the vote handler and add optimistic state. Replace the block from `const [pending, start] = useTransition();` through the existing `function runVote(...)` with:

```tsx
  const [pending, start] = useTransition();
  const [generating, setGenerating] = useState(false);
  const { session, suggestions, totalVoters, finalized } = bundle;

  type View = { suggestions: SuggestionVote[]; totalVoters: number };
  const [view, applyPick] = useOptimistic<View, string>(
    { suggestions, totalVoters },
    (state, tappedId) => {
      const prevPick = state.suggestions.find((s) => s.mine)?.id ?? null;
      const unvote = prevPick === tappedId;
      return {
        totalVoters: unvote
          ? state.totalVoters - 1
          : state.totalVoters + (prevPick === null ? 1 : 0),
        suggestions: state.suggestions.map((s) => {
          if (s.id === tappedId) {
            return { ...s, mine: !unvote, votes: s.votes + (unvote ? -1 : 1) };
          }
          if (s.id === prevPick) {
            return { ...s, mine: false, votes: s.votes - 1 };
          }
          return s;
        }),
      };
    },
  );
```

Keep the `finalized` early-return block as-is BUT move it to use `bundle` values (it already does). Note the early return must come AFTER hooks are declared — since `useOptimistic`/`useTransition` are hooks, ensure the `if (session.status === "finalized" ...)` early return stays below these hook calls. (It currently sits above `useTransition`; move the finalized early-return block to just before the final `return (` so all hooks run unconditionally.)

Replace `runVote` and add remove handler:

```tsx
  function runVote(id: string) {
    const wasMine = view.suggestions.find((s) => s.id === id)?.mine ?? false;
    start(async () => {
      applyPick(id);
      const res = wasMine ? await clearVote(session.id) : await castVote(session.id, id);
      if (res.error) toast.error(res.error);
    });
  }

  function runRemove(id: string) {
    start(async () => {
      const res = await removeSuggestionFromSession(session.id, id);
      if (res.error) toast.error(res.error);
    });
  }
```

(c) Render from `view` instead of `bundle`. Change the progress Kicker to `{view.totalVoters} of {memberCount} voted`, and the list to iterate `view.suggestions`. The list `<li>` must no longer be a single big `<button>` (so the remove control is not nested in a button). Replace the suggestions `<ul>` block with:

```tsx
        <ul className="space-y-2">
          {view.suggestions.map((s) => {
            const missing = missingIngredients(s.requiredIngredients, available);
            const canRemove = isAdmin || s.addedBy === currentUserId;
            return (
              <li key={s.id}>
                <GlassCard
                  className={cn("flex items-center gap-3", s.mine && "ring-2 ring-primary")}
                >
                  <button
                    type="button"
                    onClick={() => runVote(s.id)}
                    aria-pressed={s.mine}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="font-bold">{s.mealName}</div>
                    {missing.length > 0 ? (
                      <div className="text-destructive text-xs font-semibold">
                        needs {missing.join(", ")}
                      </div>
                    ) : (
                      <div className="text-muted-foreground text-xs font-semibold">
                        you have everything
                      </div>
                    )}
                  </button>
                  <CountChip count={s.votes} />
                  {canRemove ? (
                    <button
                      type="button"
                      aria-label={`Remove ${s.mealName}`}
                      onClick={() => runRemove(s.id)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </GlassCard>
              </li>
            );
          })}
        </ul>
```

(Removed the `⚠`/`✓` emoji glyphs per the anti-emoji rule; wording carries the meaning.)

(d) Mount `AddSuggestion` below the list (visible whenever not finalized), before the Finalize button:

```tsx
      {!generating ? <AddSuggestion sessionId={session.id} /> : null}
```

(e) Finalize button uses `view.totalVoters`:

```tsx
      {isAdmin && view.suggestions.length > 0 ? (
        <Button className="w-full" disabled={pending || view.totalVoters === 0} onClick={runFinalize}>
          Finalize {view.totalVoters === 0 ? "(no votes yet)" : "winning meal"}
        </Button>
      ) : null}
```

- [ ] **Step 4: Run → PASS** (`npx vitest run src/components/dashboard/dashboard-view.test.tsx`).

- [ ] **Step 5: Verify** (`npm run typecheck`).

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/dashboard-view.tsx src/components/dashboard/dashboard-view.test.tsx
git commit -m "feat: optimistic vote/unvote, remove suggestion, add-a-dish on dashboard"
```

---

### Task 10: Full verification

- [ ] **Step 1: Whole gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: lint clean, typecheck clean, all tests pass, build succeeds.

- [ ] **Step 2: Manual smoke (needs `.env.local` + migrated DB)**

`npm run dev` → dashboard → "Add a dish": search a seeded dish (e.g. "poha") and add it; type a non-catalog dish and use "Search with AI"; confirm both appear and a remove (X) shows on dishes you added. Vote: tap a meal (ring appears instantly), tap it again (unvotes instantly), tap another (moves). Regenerate: confirm AI rows refresh while your manually-added dish stays.

- [ ] **Step 3: Commit any fixes** (only if Step 1 required changes)

```bash
git add -A
git commit -m "chore: manual-suggestions polish"
```

---

## Self-review notes (addressed)

- **Spec coverage:** dishes table + seed (T1), search + AI upsert (T2), parseDish (T3), add/remove + regenerate guard (T4), unvote + addedBy (T5), server actions (T6), currentUserId thread (T7), combobox (T8), optimistic + remove + mount (T9). Future dish-detail page explicitly deferred (no columns/page).
- **Type consistency:** `SuggestionVote.addedBy: string | null` introduced in T5 and consumed in T9; the T1 test-fixture fix pre-empts the type break. `addCatalogSuggestion(userId, groupId, sessionId, dishId)` signature identical in T4/T6. `DishHit` shape identical in T2/T6/T8.
- **Nested-button fix:** the vote row is restructured so the remove control is a sibling, not nested in the vote `<button>`.
- **Hooks order:** the finalized early-return is moved below the hook calls so `useOptimistic`/`useTransition` always run.
- **No em-dashes; lucide icons only; one-accent/radius locks preserved.**
