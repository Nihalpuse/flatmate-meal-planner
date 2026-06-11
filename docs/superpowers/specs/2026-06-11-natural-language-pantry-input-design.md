# Natural-Language Pantry Input — Design

**Date:** 2026-06-11
**Status:** Approved (proceed)

## Goal

Let a user type what they bought in plain language ("2kg potatoes, a dozen eggs,
some milk"), have AI parse it into structured items, review/edit those items in a
modal (adjustable quantities, editable name/unit, removable rows), and confirm to
add them to the group pantry — merging into existing stock where it makes sense.

## Decisions (locked)

1. **Existing items → add to quantity.** New items are inserted; a parsed item that
   matches an existing pantry item is merged.
2. **Units:** AI infers quantity + unit. On merge, sum quantities **only if units
   match** (null-safe, case-insensitive); if units differ or one is empty, the
   bought value **replaces** the existing quantity/unit. Either way the item is
   marked available.
3. **Review modal rows are fully editable:** `−`/`+` steppers, direct number typing,
   inline-editable name & unit, and remove-row.
4. **Entry point:** an **"Add by text"** button on the Pantry screen → input modal
   (textarea + Parse) → review modal.

## Matching rule (important)

Merge matching uses **case-insensitive exact name** (`name.trim().toLowerCase()`),
matching the DB unique index `ingredients (group_id, lower(name))`. It does NOT use
the plural-normalizer from `meal-utils` (that is only for missing-ingredient
detection on the dashboard). This keeps the merge preview and the DB upsert in
agreement.

Unit match for merge: both units compared as `trim().toLowerCase()`, null-safe
(`is not distinct from` semantics). Empty vs non-empty → no match → replace.

## Architecture

### AI layer (`src/lib/ai/`)
- Extract a shared `generateJson(prompt, schema)` inside `gemini.ts` — both the
  existing meal-suggestion call and the new purchase parse use it (same
  `x-goog-api-key` header + 15s `AbortSignal.timeout`).
- `purchase-prompt.ts` (pure) — `buildPurchasePrompt(text)`: instructs the model to
  return an array of `{ name, quantity?, unit? }` with lowercase names, numeric
  quantity when stated (omit otherwise), and short unit strings (kg, g, l, ml, pcs).
  Count words are expanded to pcs (see unit normalization below).
- `parse-purchase.ts` (pure) — `parsePurchaseItems(jsonText, limit=30)`: zod-validates
  each item, lowercases name, coerces quantity to a non-negative number or drops it,
  trims unit. Mirrors `parse.ts`.

Unit normalization: the AI is instructed to emit canonical short units and to expand
count words — "a dozen" → `quantity: 12, unit: "pcs"`, "half kg" → `0.5, "kg"`,
"some"/unspecified → no quantity. The parser does not itself do unit math; it trusts
and validates the AI output.

### Server actions (`src/app/(protected)/pantry/actions.ts`)
- `parsePurchase(text: string): Promise<{ items?: ParsedItem[]; error?: string }>`
  — auth + active group; **rate-limited** via `rateLimit(\`purchase:\${userId}\`, 15, 60_000)`;
  calls `parsePurchase` AI; returns parsed items (NO DB write). Empty result →
  `{ error: "Couldn't find any items — try rephrasing." }`; AI failure →
  `{ error: "Could not reach the AI. Please try again." }`.
- `addPurchasedItems(items: ParsedItem[]): Promise<PantryState>` — auth + group;
  validates each item with `ingredientSchema`; in one transaction upserts each on the
  unique index with `onConflictDoUpdate` using CASE expressions:
  - units match (`ingredients.unit is not distinct from excluded.unit`) →
    `quantity = coalesce(ingredients.quantity,0) + coalesce(excluded.quantity,0)`, keep unit;
  - else → `quantity = excluded.quantity`, `unit = excluded.unit`;
  - always `available = true`, `updated_at = now()`.
  Returns `{ ok: true }` or `{ error }`. Revalidate `/pantry`.

### Pure merge preview (`src/lib/pantry/merge.ts`)
- `mergePreview(parsed: ParsedItem[], existing: Ingredient[]): ReviewRow[]` where
  `ReviewRow = { name, quantity?, unit?, status: "new" | "merge" | "replace",
  existingQuantity?, resultingQuantity? }`. Pure, unit-tested. The modal renders
  flags from this; the server confirm re-derives authoritatively with the same rule.

### Components (`src/components/pantry/`)
- `purchase-input.tsx` — modal shell like `IngredientSheet`: textarea + Parse + Cancel;
  Escape closes; on AI error stays open (text preserved); shows pending state.
- `purchase-review.tsx` — editable rows from `mergePreview`. Per row: name (inline
  text), `−`/qty/`+` (step 1 for count/empty unit, 0.5 for kg/g/l/ml), direct number
  input, unit (inline text), remove ✕. Footer: Confirm (writes via
  `addPurchasedItems` with the current edited rows) + Cancel. Recomputes the
  new/merge/replace flag live as the user edits name/unit.
- `pantry-view.tsx` — add the **Add by text** button; manage which modal is open
  (`input` → `review`), passing parsed items and the existing `ingredients` list into
  review for flagging.

## Data flow

1. Tap **Add by text** → PurchaseInput modal.
2. Submit text → `parsePurchase(text)` → `ParsedItem[]`.
3. Client opens PurchaseReview, building rows via `mergePreview(items, ingredients)`.
4. User edits rows; flags update live.
5. Confirm → `addPurchasedItems(rows)` → transactional upsert → `revalidatePath("/pantry")`
   → close modal → success toast.

## Error handling

- AI unreachable / rate-limited / empty parse → toast (or inline) in the input modal;
  modal stays open so typed text isn't lost.
- Confirm with an invalid row (blank name, negative qty) → `ingredientSchema` rejects;
  return the first issue message as `{ error }`, surface as toast; modal stays open.
- Confirm with zero rows (all removed) → no-op success / close.

## Testing

- `purchase-prompt.test.ts` — prompt contains the text and the key instructions
  (lowercase names, expand counts, omit unknown quantity).
- `parse-purchase.test.ts` — valid items kept & lowercased; bad entries dropped;
  quantity coercion; unit trimmed; limit respected.
- `merge.test.ts` — new; merge sums when units match (case-insensitive); replace when
  units differ or one empty; case-insensitive name match; preview totals correct.
- `addPurchasedItems` integration (PGlite) — insert new; merge-sum same unit; replace
  diff unit; replace when existing unit empty; `available` reset to true; multiple
  items in one call; item with no quantity.
- `purchase-review.test.tsx` — renders rows with flags; `+`/`−` adjust; direct typing;
  remove drops a row; editing unit flips merge↔replace flag; Confirm calls
  `addPurchasedItems` with edited payload.
- `purchase-input.test.tsx` — Parse calls `parsePurchase`; error keeps modal open.

## Out of scope (YAGNI)

- No unit conversion math (kg↔g). Mismatched units replace rather than convert.
- No history/undo of a bulk add beyond normal per-item edit/delete.
- No multi-language parsing guarantees (the model may handle it; not a requirement).
