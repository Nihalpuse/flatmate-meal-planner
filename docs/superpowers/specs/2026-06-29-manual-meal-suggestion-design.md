# Manual Meal Suggestions (Catalog Search + AI Fallback) + Unvote — Design

**Date:** 2026-06-29
**Status:** Approved (proceed)

## Goal

Let any group member add a meal to the current session's suggestion list by
searching an input box, alongside the AI-generated suggestions. Search matches a
seeded catalog of popular Indian dishes; if nothing matches, a dropdown option
adds the dish via AI (which fills its ingredients and saves it to the catalog).
Manual suggestions are additive (they never wipe AI ones or votes) and survive an
AI "Regenerate". A suggestion can be removed from the session by an admin or the
member who added it.

## Decisions (locked)

1. **Catalog is a real DB table (`dishes`), global across groups**, seeded with
   popular Indian dishes. Chosen over a frontend constant so dishes are
   first-class entities a future dish-detail page (calories/macros) can extend.
2. **Add appends one suggestion** (`aiGenerated = false`), allowed while the
   session is `open` OR `voting`. Non-destructive: never touches other
   suggestions or votes.
3. **AI fallback** (no catalog match): AI returns the dish's required
   ingredients, the dish is upserted into `dishes` (`source = 'ai'`), and the
   suggestion is appended. The catalog grows itself.
4. **Regenerate preserves manual suggestions:** `replaceSuggestions` deletes only
   `aiGenerated = true` rows.
5. **Remove from session ≠ delete from catalog.** Removing a suggestion deletes
   only the `meal_suggestions` row (its votes cascade away; voters re-vote). The
   `dishes` catalog entry is never deleted. Allowed by a group **admin OR the
   suggestion's author** (`addedBy`).
6. **Any group member can add.** Consistent with voting and pantry being
   member-open.

## Data model

### New table `dishes` (global catalog)
```ts
export const dishSource = pgEnum("dish_source", ["seed", "ai"]);

export const dishes = pgTable(
  "dishes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    requiredIngredients: jsonb("required_ingredients").$type<string[]>().notNull().default([]),
    source: dishSource("source").notNull().default("seed"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("dishes_lower_name_idx").on(sql`lower(${t.name})`)],
);
```
- Case-insensitive unique name (matches the pantry pattern).
- Future dish-detail columns (calories, macros, description, image) are added in a
  later migration when that page is built. Not now.

### `meal_suggestions` — two nullable columns (additive migration)
- `addedBy text references users(id)` (null for AI-generated) — author for the
  remove-permission check.
- `dishId uuid references dishes(id)` (null for legacy/free-text) — links a
  suggestion to its catalog dish for the future detail page.
- `requiredIngredients` stays **snapshotted** on the suggestion at add time, so the
  dashboard's `missingIngredients(...)` read path is unchanged.

### Seeding
A hand-written migration inserts ~40-50 popular Indian dishes with lowercase
required ingredients, idempotent via `ON CONFLICT DO NOTHING` on the lower-name
index. Runs with `npm run db:migrate`.

## Server actions (`src/app/(protected)/dashboard/` + `src/lib`)

Pure/DB logic lives in `src/lib/suggestions.ts` and a new `src/lib/dishes.ts`;
thin `"use server"` wrappers do auth + group resolution.

- **`searchDishes(query: string): Promise<DishHit[]>`** (`DishHit = {id, name}`).
  `lib/dishes.ts`: trims query; empty → `[]`; `where lower(name) like lower('%q%')`,
  order by name, limit 8. No auth needed beyond being signed in.
- **`addSuggestionFromCatalog(sessionId, dishId)`** → `lib/suggestions.ts`
  `addCatalogSuggestion(userId, groupId, sessionId, dishId)`. Row-locked txn on the
  session: must belong to group and be `open|voting`; load the dish; dedup by
  `lower(name)` among existing session suggestions; enforce cap (15); insert
  `{ sessionId, mealName: dish.name, requiredIngredients: dish.requiredIngredients,
  aiGenerated: false, addedBy: userId, dishId }`. Returns error string or null.
- **`addSuggestionWithAI(sessionId, name)`** → resolves ingredients via a new
  `lib/ai/gemini.ts` `parseDish(name)` (reuses `generateJson` + a dish-ingredients
  schema), upserts the dish into `dishes` (`source:'ai'`, `onConflictDoNothing`,
  then read back), then calls the same `addCatalogSuggestion`. Rate-limited
  `rateLimit(\`dish-ai:\${userId}\`, 20, 60_000)`. Same dedup/cap/status rules.
- **`removeSuggestionFromSession(sessionId, suggestionId)`** → `lib/suggestions.ts`
  `removeSuggestion(userId, groupId, isAdmin, sessionId, suggestionId)`. Row-locked
  txn: session in group and not `finalized`; load the suggestion; allow if
  `isAdmin || suggestion.addedBy === userId` else "You can only remove suggestions
  you added"; delete the `meal_suggestions` row (votes cascade). The `dishes` row is
  untouched. Returns error string or null.

### Regenerate change
`replaceSuggestions` (existing) changes its delete to
`where sessionId = ? AND aiGenerated = true`, and the open-status guard stays. AI
regeneration now replaces only AI rows; manual ones persist.

## UI (dashboard `SessionPanel`)

- New client component `add-suggestion.tsx`: an **"+ Add a dish"** button that
  reveals a combobox (text input + results dropdown). Typing calls `searchDishes`
  (debounced ~250ms) via a transition; results render as pickable rows. When the
  trimmed query is non-empty and has no exact match, the final dropdown row is
  **"Search '<query>' with AI"** → `addSuggestionWithAI`. Picking a catalog row →
  `addSuggestionFromCatalog`. On success the parent refreshes (the dashboard
  already polls / `router.refresh()`); errors toast via `sonner`.
- Each suggestion row in `dashboard-view.tsx` shows a small remove (✕) button when
  `isAdmin || suggestion.addedBy === currentUserId`. The dashboard already passes
  `isAdmin`; it must also pass `currentUserId`, and `getVoteStateForSessions` must
  include `addedBy` in the `SuggestionVote` shape.
- Styling matches existing glass/Kicker/Button conventions; lucide icons; no new
  deps. Combobox is keyboard-accessible (input + listbox semantics) and honors the
  one-accent / radius locks.

## Edge cases, auth, limits

- **Dedup:** adding a dish whose `lower(name)` already exists in the session returns
  "Already suggested" (friendly toast); no insert.
- **Cap:** max 15 suggestions per session; over cap returns an error.
- **Status:** add allowed only while `open|voting`; `finalized|cancelled` →
  "Voting is closed". Remove disallowed only when `finalized`.
- **AI fallback failure:** Gemini error → "Could not reach the AI. Please try
  again."; empty/again rate-limited → friendly message; modal/input stays.
- **Adding does not flip status to voting** (only casting a vote does). Manual rows
  survive regenerate via the `aiGenerated` guard regardless of status.
- **Removing a suggestion you voted for** is fine; the cascade clears your vote.

## Testing

- **`lib/dishes.ts`** (PGlite): `searchDishes` case-insensitive substring match,
  empty query, limit; upsert-by-name idempotency.
- **`lib/suggestions.ts`** (PGlite): `addCatalogSuggestion` appends without
  touching AI rows; dedup; cap; status guard; `removeSuggestion` author allowed,
  admin allowed, other-member forbidden, catalog row survives removal; regenerate
  deletes only AI rows and keeps manual ones.
- **`parseDish`** pure parser test (valid/invalid JSON, lowercase ingredients).
- **Component:** `add-suggestion.test.tsx` — typing triggers search, catalog row
  click calls `addSuggestionFromCatalog`, no-match shows the AI row which calls
  `addSuggestionWithAI`; remove button visibility by author/admin in
  `dashboard-view.test.tsx`.

## Added feature: Unvote / abstain (toggle off)

Today a member can cast or move a vote but cannot remove it — there is no way to
end up with no selection. This adds that.

- **`lib/votes.ts` `clearVoteForUser(userId, groupId, sessionId)`** — row-locked
  txn: session must be in group and not `finalized` (`"Voting is closed"` otherwise);
  delete the caller's own `votes` row for the session (`where sessionId = ? AND
  userId = ?`). Returns error string or null. No-op-safe if no vote exists.
- **`clearVote(sessionId)`** `"use server"` action mirrors `castVote` (auth +
  group), calls `clearVoteForUser`, `revalidatePath("/dashboard")`.
- **UI (`dashboard-view.tsx`):** `runVote(suggestion)` toggles — if
  `suggestion.mine` is true, call `clearVote(session.id)`; otherwise
  `castVote(session.id, suggestion.id)`. The selected row keeps its
  `aria-pressed` + ring; tapping it again clears. Count and "X of N voted" update
  on refresh.
- **Status:** clearing a vote does not revert the session from `voting` to `open`
  (keeps Regenerate locked once voting has started). Finalize with zero votes still
  returns "No votes yet".
- **Tests (PGlite):** `clearVoteForUser` removes only the caller's vote, is a no-op
  when none exists, and is blocked once `finalized`; component test: tapping a
  `mine` row calls `clearVote`, tapping another calls `castVote`.

## Out of scope (YAGNI)

- Dish-detail page and calories/macros (schema leaves room; no columns/page now).
- Editing a suggestion's name/ingredients after adding (remove + re-add instead).
- Per-user "favorites", catalog moderation/admin UI, fuzzy/typo search ranking.
