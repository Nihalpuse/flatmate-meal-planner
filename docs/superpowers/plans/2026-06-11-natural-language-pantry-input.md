# Natural-Language Pantry Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user type what they bought in plain language, have AI parse it to structured items, review/edit them in a modal (adjust quantity, edit name/unit, remove rows), and confirm to add them to the pantry — summing into existing stock when units match, replacing otherwise.

**Architecture:** A new pure prompt builder + zod parser mirror the existing meal-suggestion AI files. The Gemini client gets a small shared `generateJson(prompt, schema)` helper used by both meal suggestions and purchase parsing. A pure `merge.ts` decides new/merge/replace per item and is shared by the review modal (live preview) and the server write (authoritative). Two server actions — `parsePurchaseText` (AI, no write) and `addPurchasedItems` (transactional upsert) — bracket an input modal and an editable review modal on the Pantry screen.

**Tech Stack:** Next.js 16 App Router (server actions; `searchParams`/params are Promises), Drizzle ORM + Neon, zod v4, Gemini (`gemini-2.5-flash`, structured JSON), Vitest + Testing Library + PGlite for DB integration tests.

**Conventions:** Run a single test file with `npx vitest run <path>`; full suite `npm test`. Typecheck `npm run typecheck`. Commit after each task with the message shown. Work on branch `pantry-nl-input` (already created; the spec and the client/server decoupling fix are already committed there).

**Shared types (defined once, used across tasks):**
- `ParsedItem = { name: string; quantity?: number; unit?: string }` — exported from `src/lib/ai/parse-purchase.ts` (Task 2).
- `ReviewRow`, `ResolvedMerge`, `MergeStatus` — exported from `src/lib/pantry/merge.ts` (Task 4).

---

### Task 1: Purchase prompt builder (pure)

**Files:**
- Create: `src/lib/ai/purchase-prompt.ts`
- Test: `src/lib/ai/purchase-prompt.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/ai/purchase-prompt.test.ts`

```ts
import { expect, test } from "vitest";

import { buildPurchasePrompt } from "./purchase-prompt";

test("includes the user's text and the key extraction rules", () => {
  const p = buildPurchasePrompt("2kg potatoes, a dozen eggs, some milk");
  expect(p).toContain("2kg potatoes, a dozen eggs, some milk");
  expect(p).toMatch(/lowercase/i);
  expect(p).toMatch(/omit it when not stated/i);
  expect(p).toMatch(/dozen/i); // count-word expansion instruction
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/ai/purchase-prompt.test.ts`
Expected: FAIL — cannot find module `./purchase-prompt`.

- [ ] **Step 3: Implement** — `src/lib/ai/purchase-prompt.ts`

```ts
export function buildPurchasePrompt(text: string): string {
  return [
    "You are a grocery assistant for flatmates in India.",
    "The user describes what they just bought, in natural language.",
    "Extract a list of pantry items.",
    "Rules:",
    '- Use simple lowercase ingredient names (e.g. "potato", "egg", "milk").',
    "- Set quantity as a number when stated; omit it when not stated.",
    "- Use short units: kg, g, l, ml, pcs.",
    '- Expand count words to pcs: "a dozen" => quantity 12, unit "pcs"; "a pair" => 2 pcs.',
    '- Convert fractions to decimals: "half kg" => 0.5 kg.',
    "- One entry per distinct item.",
    "Return ONLY JSON matching the requested schema.",
    `User said: ${text}`,
  ].join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/ai/purchase-prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/purchase-prompt.ts src/lib/ai/purchase-prompt.test.ts
git commit -m "feat: purchase-parsing prompt builder"
```

---

### Task 2: Purchase parser (pure)

**Files:**
- Create: `src/lib/ai/parse-purchase.ts`
- Test: `src/lib/ai/parse-purchase.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/ai/parse-purchase.test.ts`

```ts
import { expect, test } from "vitest";

import { parsePurchaseItems } from "./parse-purchase";

test("keeps valid items, lowercases name and unit", () => {
  const json = JSON.stringify([
    { name: "Potato", quantity: 2, unit: "KG" },
    { name: "Egg", quantity: 12, unit: "pcs" },
  ]);
  expect(parsePurchaseItems(json)).toEqual([
    { name: "potato", quantity: 2, unit: "kg" },
    { name: "egg", quantity: 12, unit: "pcs" },
  ]);
});

test("allows items with no quantity or unit (e.g. 'some milk')", () => {
  expect(parsePurchaseItems(JSON.stringify([{ name: "milk" }]))).toEqual([
    { name: "milk" },
  ]);
});

test("tolerates null quantity/unit from the model", () => {
  const json = JSON.stringify([{ name: "milk", quantity: null, unit: null }]);
  expect(parsePurchaseItems(json)).toEqual([{ name: "milk" }]);
});

test("drops invalid entries and bad JSON", () => {
  expect(parsePurchaseItems("not json")).toEqual([]);
  const json = JSON.stringify([{ name: "" }, { quantity: 3 }, { name: "rice" }]);
  expect(parsePurchaseItems(json)).toEqual([{ name: "rice" }]);
});

test("respects the limit", () => {
  const json = JSON.stringify(
    Array.from({ length: 40 }, (_, i) => ({ name: `item${i}` })),
  );
  expect(parsePurchaseItems(json, 5)).toHaveLength(5);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/ai/parse-purchase.test.ts`
Expected: FAIL — cannot find module `./parse-purchase`.

- [ ] **Step 3: Implement** — `src/lib/ai/parse-purchase.ts`

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/ai/parse-purchase.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/parse-purchase.ts src/lib/ai/parse-purchase.test.ts
git commit -m "feat: purchase-parsing zod parser"
```

---

### Task 3: Gemini `generateJson` extraction + `parsePurchase`

**Files:**
- Modify: `src/lib/ai/gemini.ts`

- [ ] **Step 1: Rewrite `src/lib/ai/gemini.ts`** to extract a shared helper and add the purchase call:

```ts
import { env } from "@/env";
import { buildPurchasePrompt } from "./purchase-prompt";
import { buildSuggestionPrompt, type SuggestionInput } from "./prompt";
import { parsePurchaseItems, type ParsedItem } from "./parse-purchase";
import { parseSuggestions, type Suggestion } from "./parse";

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const REQUEST_TIMEOUT_MS = 15_000;

const SUGGESTION_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      mealName: { type: "STRING" },
      requiredIngredients: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["mealName", "requiredIngredients"],
  },
} as const;

const PURCHASE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING" },
      quantity: { type: "NUMBER" },
      unit: { type: "STRING" },
    },
    required: ["name"],
  },
} as const;

/** POST a prompt + response schema to Gemini and return the raw JSON text. */
async function generateJson(prompt: string, schema: unknown): Promise<string> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Gemini request failed: ${res.status}`);

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
}

export async function generateMealSuggestions(
  input: SuggestionInput,
): Promise<Suggestion[]> {
  const text = await generateJson(buildSuggestionPrompt(input), SUGGESTION_SCHEMA);
  return parseSuggestions(text);
}

/** Parse a free-text "what I bought" message into structured pantry items. */
export async function parsePurchase(text: string): Promise<ParsedItem[]> {
  const out = await generateJson(buildPurchasePrompt(text), PURCHASE_SCHEMA);
  return parsePurchaseItems(out);
}
```

- [ ] **Step 2: Verify typecheck + existing AI tests still pass**

Run: `npm run typecheck && npx vitest run src/lib/ai`
Expected: PASS (the existing `prompt.test.ts` and `parse.test.ts` are unaffected; `generateMealSuggestions` behaves identically).

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/gemini.ts
git commit -m "feat: share Gemini generateJson helper, add parsePurchase"
```

---

### Task 4: Merge resolution (pure)

**Files:**
- Create: `src/lib/pantry/merge.ts`
- Test: `src/lib/pantry/merge.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/pantry/merge.test.ts`

```ts
import { expect, test } from "vitest";

import { mergePreview, resolveMergedValues } from "./merge";
import type { Ingredient } from "@/db/schema";

const ing = (over: Partial<Ingredient>): Ingredient => ({
  id: "i1",
  groupId: "g",
  name: "Rice",
  quantity: 1,
  unit: "kg",
  available: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

test("resolveMergedValues: new when no existing", () => {
  expect(resolveMergedValues(null, { quantity: 2, unit: "kg" })).toEqual({
    quantity: 2,
    unit: "kg",
    status: "new",
  });
});

test("resolveMergedValues: sums when units match (case-insensitive)", () => {
  expect(
    resolveMergedValues({ quantity: 1, unit: "KG" }, { quantity: 2, unit: "kg" }),
  ).toEqual({ quantity: 3, unit: "KG", status: "merge" });
});

test("resolveMergedValues: merges when both units empty", () => {
  expect(
    resolveMergedValues({ quantity: 1, unit: null }, { quantity: 2 }),
  ).toEqual({ quantity: 3, unit: null, status: "merge" });
});

test("resolveMergedValues: replaces when units differ or one is empty", () => {
  expect(
    resolveMergedValues({ quantity: 1, unit: "kg" }, { quantity: 2, unit: "packet" }),
  ).toEqual({ quantity: 2, unit: "packet", status: "replace" });
  expect(
    resolveMergedValues({ quantity: 5, unit: null }, { quantity: 2, unit: "kg" }),
  ).toEqual({ quantity: 2, unit: "kg", status: "replace" });
});

test("mergePreview flags rows by case-insensitive name match", () => {
  const rows = mergePreview(
    [
      { name: "rice", quantity: 2, unit: "kg" }, // matches existing "Rice" 1kg
      { name: "paneer", quantity: 1, unit: "packet" }, // new
    ],
    [ing({})],
  );
  expect(rows[0]).toMatchObject({
    name: "rice",
    status: "merge",
    existingQuantity: 1,
    resultingQuantity: 3,
  });
  expect(rows[1]).toMatchObject({ name: "paneer", status: "new", resultingQuantity: 1 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pantry/merge.test.ts`
Expected: FAIL — cannot find module `./merge`.

- [ ] **Step 3: Implement** — `src/lib/pantry/merge.ts`

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pantry/merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pantry/merge.ts src/lib/pantry/merge.test.ts
git commit -m "feat: pure pantry merge resolution + preview"
```

---

### Task 5: Server actions — `parsePurchaseText` and `addPurchasedItems`

**Files:**
- Modify: `src/app/(protected)/pantry/actions.ts`
- Test: `src/app/(protected)/pantry/add-purchased.integration.test.ts`

- [ ] **Step 1: Write the failing integration test** — `src/app/(protected)/pantry/add-purchased.integration.test.ts`

```ts
// @vitest-environment node
import { beforeAll, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

const auth = vi.fn();
vi.mock("@/auth", () => ({ auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { groupMembers, groups, ingredients, users } from "@/db/schema";
import { addPurchasedItems } from "./actions";

let groupId: string;

beforeAll(async () => {
  await db.insert(users).values({ id: "u1", email: "u1@x.y" });
  const [g] = await db
    .insert(groups)
    .values({ name: "Flat", inviteCode: "CCCCCC", createdBy: "u1" })
    .returning({ id: groups.id });
  groupId = g.id;
  await db.insert(groupMembers).values({ groupId, userId: "u1", role: "admin" });
});

beforeEach(async () => {
  await db.delete(ingredients);
  auth.mockResolvedValue({ user: { id: "u1" } });
});

async function rows() {
  return db
    .select()
    .from(ingredients)
    .where(eq(ingredients.groupId, groupId))
    .orderBy(ingredients.name);
}

test("inserts new items", async () => {
  const res = await addPurchasedItems([
    { name: "potato", quantity: 2, unit: "kg" },
    { name: "milk" },
  ]);
  expect(res).toEqual({ ok: true });
  const r = await rows();
  expect(r.map((x) => x.name)).toEqual(["milk", "potato"]);
  expect(r.find((x) => x.name === "potato")).toMatchObject({ quantity: 2, unit: "kg" });
  expect(r.find((x) => x.name === "milk")).toMatchObject({ quantity: null, unit: null });
});

test("sums quantity when units match, marks available", async () => {
  await db
    .insert(ingredients)
    .values({ groupId, name: "Rice", quantity: 1, unit: "kg", available: false });
  await addPurchasedItems([{ name: "rice", quantity: 2, unit: "kg" }]);
  const [rice] = await rows();
  expect(rice).toMatchObject({ quantity: 3, unit: "kg", available: true });
});

test("replaces when units differ", async () => {
  await db.insert(ingredients).values({ groupId, name: "oil", quantity: 1, unit: "l" });
  await addPurchasedItems([{ name: "oil", quantity: 2, unit: "packet" }]);
  const [oil] = await rows();
  expect(oil).toMatchObject({ quantity: 2, unit: "packet" });
});

test("rejects an invalid item without writing", async () => {
  const res = await addPurchasedItems([{ name: "", quantity: 1 }]);
  expect(res.error).toBeTruthy();
  expect(await rows()).toHaveLength(0);
});

test("empty list is a no-op success", async () => {
  expect(await addPurchasedItems([])).toEqual({ ok: true });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/app/(protected)/pantry/add-purchased.integration.test.ts"`
Expected: FAIL — `addPurchasedItems` is not exported.

- [ ] **Step 3: Implement** — append to `src/app/(protected)/pantry/actions.ts`

First add imports at the top (next to the existing imports):

```ts
import { redirect } from "next/navigation";

import { parsePurchase } from "@/lib/ai/gemini";
import type { ParsedItem } from "@/lib/ai/parse-purchase";
import { resolveMergedValues } from "@/lib/pantry/merge";
import { rateLimit } from "@/lib/rate-limit";
```

(`auth`, `db`, `ingredients`, `getActiveGroup`, `ingredientSchema`, `and`, `eq`, `revalidatePath` are already imported in this file; add `sql` to the existing `drizzle-orm` import.)

Then append these two actions:

```ts
export type ParsePurchaseState = { items?: ParsedItem[]; error?: string };

/** AI-parse a free-text purchase message into items. Does NOT write to the DB. */
export async function parsePurchaseText(text: string): Promise<ParsePurchaseState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const trimmed = text.trim();
  if (!trimmed) return { error: "Type what you bought first." };

  if (!rateLimit(`purchase:${session.user.id}`, 15, 60_000)) {
    return { error: "Too many attempts. Try again in a minute." };
  }

  let items: ParsedItem[];
  try {
    items = await parsePurchase(trimmed);
  } catch {
    return { error: "Could not reach the AI. Please try again." };
  }
  if (items.length === 0) {
    return { error: "Couldn't find any items — try rephrasing." };
  }
  return { items };
}

/** Add reviewed items to the pantry: sum on unit match, replace otherwise. */
export async function addPurchasedItems(items: ParsedItem[]): Promise<PantryState> {
  const groupId = await activeGroupId();
  if (!groupId) return { error: "No active group" };

  const clean: ParsedItem[] = [];
  for (const raw of items) {
    const parsed = ingredientSchema.safeParse({
      name: raw.name,
      quantity: raw.quantity,
      unit: raw.unit,
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const item: ParsedItem = { name: parsed.data.name };
    if (parsed.data.quantity !== undefined) item.quantity = parsed.data.quantity;
    if (parsed.data.unit !== undefined) item.unit = parsed.data.unit;
    clean.push(item);
  }
  if (clean.length === 0) return { ok: true };

  await db.transaction(async (tx) => {
    for (const item of clean) {
      const [existing] = await tx
        .select()
        .from(ingredients)
        .where(
          and(
            eq(ingredients.groupId, groupId),
            sql`lower(${ingredients.name}) = lower(${item.name})`,
          ),
        )
        .limit(1);

      const resolved = resolveMergedValues(
        existing ? { quantity: existing.quantity, unit: existing.unit } : null,
        { quantity: item.quantity, unit: item.unit },
      );

      if (existing) {
        await tx
          .update(ingredients)
          .set({
            quantity: resolved.quantity,
            unit: resolved.unit,
            available: true,
            updatedAt: new Date(),
          })
          .where(eq(ingredients.id, existing.id));
      } else {
        await tx.insert(ingredients).values({
          groupId,
          name: item.name,
          quantity: resolved.quantity,
          unit: resolved.unit,
        });
      }
    }
  });

  revalidatePath("/pantry");
  return { ok: true };
}
```

Note: `activeGroupId()` already exists in this file (used by `saveIngredient`). `ingredientSchema` lowercases nothing, but the names arriving from `parsePurchaseItems`/review are already lowercased; `name` matching uses SQL `lower()` regardless.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run "src/app/(protected)/pantry/add-purchased.integration.test.ts" && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(protected)/pantry/actions.ts" "src/app/(protected)/pantry/add-purchased.integration.test.ts"
git commit -m "feat: parsePurchaseText + addPurchasedItems server actions"
```

---

### Task 6: Review modal component

**Files:**
- Create: `src/components/pantry/purchase-review.tsx`
- Test: `src/components/pantry/purchase-review.test.tsx`

- [ ] **Step 1: Write the failing test** — `src/components/pantry/purchase-review.test.tsx`

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

const addPurchasedItems = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/app/(protected)/pantry/actions", () => ({ addPurchasedItems }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { Ingredient } from "@/db/schema";
import { PurchaseReview } from "./purchase-review";

const existing: Ingredient[] = [
  {
    id: "i1", groupId: "g", name: "rice", quantity: 1, unit: "kg",
    available: true, createdAt: new Date(), updatedAt: new Date(),
  },
];

const items = [
  { name: "rice", quantity: 2, unit: "kg" },
  { name: "potato", quantity: 3, unit: "kg" },
];

function setup() {
  const onClose = vi.fn();
  render(<PurchaseReview items={items} existing={existing} onClose={onClose} />);
  return { onClose };
}

test("renders a row per item with merge/new flags", () => {
  setup();
  expect(screen.getByDisplayValue("rice")).toBeInTheDocument();
  expect(screen.getByDisplayValue("potato")).toBeInTheDocument();
  expect(screen.getByText(/have 1/i)).toBeInTheDocument(); // merge preview for rice
});

test("plus button increments the quantity", async () => {
  setup();
  const riceRow = screen.getByTestId("review-row-0");
  await userEvent.click(within(riceRow).getByRole("button", { name: /increase/i }));
  expect(within(riceRow).getByLabelText(/quantity/i)).toHaveValue(3);
});

test("removing a row drops it", async () => {
  setup();
  await userEvent.click(
    within(screen.getByTestId("review-row-1")).getByRole("button", { name: /remove/i }),
  );
  expect(screen.queryByDisplayValue("potato")).not.toBeInTheDocument();
});

test("confirm sends the edited rows", async () => {
  const { onClose } = setup();
  await userEvent.click(screen.getByRole("button", { name: /add to pantry/i }));
  expect(addPurchasedItems).toHaveBeenCalledWith([
    { name: "rice", quantity: 2, unit: "kg" },
    { name: "potato", quantity: 3, unit: "kg" },
  ]);
  expect(onClose).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/pantry/purchase-review.test.tsx`
Expected: FAIL — cannot find module `./purchase-review`.

- [ ] **Step 3: Implement** — `src/components/pantry/purchase-review.tsx`

```tsx
"use client";

import { Minus, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { addPurchasedItems } from "@/app/(protected)/pantry/actions";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import type { ParsedItem } from "@/lib/ai/parse-purchase";
import { mergePreview } from "@/lib/pantry/merge";
import type { Ingredient } from "@/db/schema";

const WEIGHT_VOLUME = new Set(["kg", "g", "l", "ml"]);
function stepFor(unit?: string): number {
  return unit && WEIGHT_VOLUME.has(unit.trim().toLowerCase()) ? 0.5 : 1;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function PurchaseReview({
  items,
  existing,
  onClose,
}: {
  items: ParsedItem[];
  existing: Ingredient[];
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ParsedItem[]>(items);
  const [pending, start] = useTransition();
  const preview = mergePreview(rows, existing);

  function update(i: number, patch: Partial<ParsedItem>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function step(i: number, dir: 1 | -1) {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        const next = round(Math.max(0, (r.quantity ?? 0) + dir * stepFor(r.unit)));
        return { ...r, quantity: next };
      }),
    );
  }

  function confirm() {
    start(async () => {
      const res = await addPurchasedItems(rows);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Added to pantry");
        onClose();
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review purchased items"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <GlassCard className="relative z-10 flex max-h-[85vh] w-full max-w-sm flex-col rounded-b-none sm:rounded-[22px]">
        <h2 className="text-lg font-extrabold">Review items</h2>

        {rows.length === 0 ? (
          <p className="text-muted-foreground py-6 text-sm">No items left to add.</p>
        ) : (
          <ul className="my-3 flex-1 space-y-2 overflow-y-auto">
            {rows.map((row, i) => {
              const flag = preview[i];
              return (
                <li key={i} data-testid={`review-row-${i}`} className="rounded-lg border p-2">
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="Name"
                      value={row.name}
                      onChange={(e) => update(i, { name: e.target.value })}
                      className="bg-card min-w-0 flex-1 rounded-md border px-2 py-1 text-sm font-semibold"
                    />
                    <button
                      type="button"
                      aria-label="Remove item"
                      onClick={() => remove(i)}
                      className="text-muted-foreground shrink-0"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label="Decrease quantity"
                      onClick={() => step(i, -1)}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <input
                      aria-label="Quantity"
                      type="number"
                      min="0"
                      step="any"
                      value={row.quantity ?? ""}
                      onChange={(e) =>
                        update(i, {
                          quantity: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                      className="bg-card w-16 rounded-md border px-2 py-1 text-center text-sm"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label="Increase quantity"
                      onClick={() => step(i, 1)}
                    >
                      <Plus className="size-4" />
                    </Button>
                    <input
                      aria-label="Unit"
                      value={row.unit ?? ""}
                      placeholder="unit"
                      onChange={(e) => update(i, { unit: e.target.value || undefined })}
                      className="bg-card w-16 rounded-md border px-2 py-1 text-sm"
                    />
                  </div>

                  <p className="text-muted-foreground mt-1 text-xs">
                    {flag.status === "new"
                      ? "New item"
                      : flag.status === "merge"
                        ? `Have ${flag.existingQuantity ?? 0} → ${flag.resultingQuantity}`
                        : `Replaces current stock`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={pending || rows.length === 0}
            onClick={confirm}
          >
            {pending ? "Adding…" : "Add to pantry"}
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/pantry/purchase-review.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/pantry/purchase-review.tsx src/components/pantry/purchase-review.test.tsx
git commit -m "feat: editable purchase review modal"
```

---

### Task 7: Input modal component

**Files:**
- Create: `src/components/pantry/purchase-input.tsx`
- Test: `src/components/pantry/purchase-input.test.tsx`

- [ ] **Step 1: Write the failing test** — `src/components/pantry/purchase-input.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

const parsePurchaseText = vi.fn();
vi.mock("@/app/(protected)/pantry/actions", () => ({ parsePurchaseText }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { PurchaseInput } from "./purchase-input";

test("parsing success hands items to onParsed", async () => {
  const items = [{ name: "milk" }];
  parsePurchaseText.mockResolvedValue({ items });
  const onParsed = vi.fn();
  render(<PurchaseInput onParsed={onParsed} onClose={vi.fn()} />);

  await userEvent.type(screen.getByLabelText(/what did you buy/i), "some milk");
  await userEvent.click(screen.getByRole("button", { name: /^parse/i }));

  expect(parsePurchaseText).toHaveBeenCalledWith("some milk");
  expect(onParsed).toHaveBeenCalledWith(items);
});

test("error keeps the modal open and does not call onParsed", async () => {
  parsePurchaseText.mockResolvedValue({ error: "Couldn't find any items — try rephrasing." });
  const onParsed = vi.fn();
  render(<PurchaseInput onParsed={onParsed} onClose={vi.fn()} />);

  await userEvent.type(screen.getByLabelText(/what did you buy/i), "asdf");
  await userEvent.click(screen.getByRole("button", { name: /^parse/i }));

  expect(onParsed).not.toHaveBeenCalled();
  expect(screen.getByText(/try rephrasing/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/pantry/purchase-input.test.tsx`
Expected: FAIL — cannot find module `./purchase-input`.

- [ ] **Step 3: Implement** — `src/components/pantry/purchase-input.tsx`

```tsx
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/pantry/purchase-input.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/pantry/purchase-input.tsx src/components/pantry/purchase-input.test.tsx
git commit -m "feat: natural-language purchase input modal"
```

---

### Task 8: Wire into the Pantry screen

**Files:**
- Modify: `src/components/pantry/pantry-view.tsx`
- Test: `src/components/pantry/pantry-view.test.tsx`

- [ ] **Step 1: Add a failing test** — append to `src/components/pantry/pantry-view.test.tsx`

First check the existing mocks at the top of that file. Add (if not already present) a mock for the pantry actions so the new button's flow is inert, then add this test:

```tsx
test("opens the add-by-text input modal", async () => {
  render(<PantryView ingredients={[]} />);
  await userEvent.click(screen.getByRole("button", { name: /add by text/i }));
  expect(screen.getByRole("dialog", { name: /add pantry items by text/i })).toBeInTheDocument();
});
```

If the file lacks `userEvent`/action mocks, add at the top:

```tsx
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(protected)/pantry/actions", () => ({
  parsePurchaseText: vi.fn(),
  addPurchasedItems: vi.fn(),
  saveIngredient: vi.fn(),
  deleteIngredient: vi.fn(),
  setAvailability: vi.fn(),
}));
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/pantry/pantry-view.test.tsx`
Expected: FAIL — no "Add by text" button.

- [ ] **Step 3: Implement** — update `src/components/pantry/pantry-view.tsx`

Add imports:

```tsx
import { Plus, Search, Sparkles } from "lucide-react";
import { PurchaseInput } from "./purchase-input";
import { PurchaseReview } from "./purchase-review";
import type { ParsedItem } from "@/lib/ai/parse-purchase";
```

Add modal state next to the existing `sheet` state:

```tsx
  const [textFlow, setTextFlow] = useState<
    { step: "input" } | { step: "review"; items: ParsedItem[] } | null
  >(null);
```

Replace the header's button cluster so both actions are present:

```tsx
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Pantry</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTextFlow({ step: "input" })}>
            <Sparkles className="size-4" /> Add by text
          </Button>
          <Button onClick={() => setSheet({ editing: null })}>
            <Plus className="size-4" /> Add
          </Button>
        </div>
      </div>
```

Before the closing `</section>`, render the flow modals:

```tsx
      {textFlow?.step === "input" ? (
        <PurchaseInput
          onParsed={(items) => setTextFlow({ step: "review", items })}
          onClose={() => setTextFlow(null)}
        />
      ) : null}
      {textFlow?.step === "review" ? (
        <PurchaseReview
          items={textFlow.items}
          existing={ingredients}
          onClose={() => setTextFlow(null)}
        />
      ) : null}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/pantry/pantry-view.test.tsx && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/pantry/pantry-view.tsx src/components/pantry/pantry-view.test.tsx
git commit -m "feat: wire add-by-text flow into the pantry screen"
```

---

### Task 9: Full verification

- [ ] **Step 1: Run the whole gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: lint clean, typecheck clean, all tests pass, build succeeds.

- [ ] **Step 2: Manual smoke (optional, needs `.env.local` with `GEMINI_API_KEY`)**

`npm run dev` → Pantry → **Add by text** → type "2kg potatoes, a dozen eggs, some milk" → Parse → adjust a quantity, rename an item, remove one → **Add to pantry** → confirm the rows appear/merge in the list.

- [ ] **Step 3: Commit any final touch-ups** (only if Step 1 required fixes)

```bash
git add -A
git commit -m "chore: natural-language pantry input polish"
```

---

## Self-review notes (addressed)

- **Spec coverage:** entry button + input modal (Task 7/8), AI parse with reuse of `generateJson` (Task 3), pure prompt/parser (Tasks 1–2), merge rule shared by preview + write (Task 4), editable review modal with steppers/typing/inline name+unit/remove (Task 6), transactional upsert with sum-on-unit-match/replace + available reset (Task 5), rate limiting on the AI call (Task 5), error handling that keeps the input modal open (Task 7).
- **Matching rule:** merge matches on `lower(name)` (DB) and `name.trim().toLowerCase()` (preview) — consistent, and distinct from the plural-normalizer in `meal-utils`.
- **Type consistency:** `ParsedItem` (parse-purchase.ts) and `resolveMergedValues`/`mergePreview`/`ReviewRow` (merge.ts) are used with identical signatures in Tasks 4–8.
