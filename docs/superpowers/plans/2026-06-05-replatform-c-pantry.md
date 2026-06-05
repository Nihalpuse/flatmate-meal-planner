# Re-platform C — Pantry on Drizzle + Remove Supabase

**Goal:** Move pantry reads/writes from Supabase to Drizzle/Neon (scoped to the user's active group to close the IDOR the review flagged), switch the `Ingredient` type to the Drizzle-inferred one, and delete the last Supabase code + deps — leaving the app 100% Supabase-free.

**Architecture:** The pantry page resolves the active group via `auth()` + `getActiveGroup` and queries `ingredients WHERE group_id = activeGroup`. Every mutation (`saveIngredient`/`deleteIngredient`/`setAvailability`) derives the group from the session and scopes its `WHERE` by `group_id` — so a user can never touch another group's rows. Component field names are unchanged (all single-word), only the type import source moves.

**Tech Stack:** Drizzle/Neon, Next.js 16 Server Actions, zod.

Re-platform Plan C of 3 (final). Depends on Plans A + B (merged). After this, `@supabase/*` is gone.

---

## File Structure

**Modified:**
- `src/app/(protected)/pantry/actions.ts` — Drizzle, group-scoped (IDOR fix), friendly duplicate-name message
- `src/app/(protected)/pantry/page.tsx` — Drizzle, group-scoped read
- `src/lib/pantry/filter.ts` — import `Ingredient` from `@/db/schema`
- `src/components/pantry/ingredient-row.tsx`, `ingredient-sheet.tsx`, `pantry-view.tsx` — import `Ingredient` from `@/db/schema`
- the three pantry component test files — fixtures use Drizzle field names (`groupId`, `createdAt`/`updatedAt` as `Date`)
- `.env.example` — drop the Supabase block (keep DATABASE_URL, AUTH_SECRET, GEMINI_API_KEY, NEXT_PUBLIC_APP_URL)

**Deleted:**
- `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts` (and the now-empty `src/lib/supabase/`)
- `src/types/database.ts`

**Removed deps:** `@supabase/supabase-js`, `@supabase/ssr`.

---

## Task 1: Pantry actions on Drizzle (group-scoped)

- [ ] Replace `src/app/(protected)/pantry/actions.ts` with:
```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import { ingredients } from "@/db/schema";
import { getActiveGroup } from "@/lib/groups";
import { ingredientSchema } from "@/lib/pantry/validation";

export type PantryState = { error?: string; ok?: boolean };

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

/** The current user's active group id, or null if unauthenticated / no group. */
async function activeGroupId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const group = await getActiveGroup(session.user.id);
  return group?.id ?? null;
}

/** Insert (no id) or update (id present) an ingredient in the user's group. */
export async function saveIngredient(
  _prev: PantryState,
  formData: FormData,
): Promise<PantryState> {
  const parsed = ingredientSchema.safeParse({
    name: formData.get("name"),
    quantity: formData.get("quantity"),
    unit: formData.get("unit"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const groupId = await activeGroupId();
  if (!groupId) return { error: "No active group" };

  const id = formData.get("id");
  try {
    if (typeof id === "string" && id.length > 0) {
      // Scope by group_id so a user can't edit another group's ingredient.
      await db
        .update(ingredients)
        .set({
          name: parsed.data.name,
          quantity: parsed.data.quantity ?? null,
          unit: parsed.data.unit ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(ingredients.id, id), eq(ingredients.groupId, groupId)));
    } else {
      await db.insert(ingredients).values({
        groupId,
        name: parsed.data.name,
        quantity: parsed.data.quantity ?? null,
        unit: parsed.data.unit ?? null,
      });
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "That ingredient is already in your pantry" };
    }
    throw error;
  }

  revalidatePath("/pantry");
  return { ok: true };
}

export async function deleteIngredient(id: string): Promise<void> {
  const groupId = await activeGroupId();
  if (!groupId) return;
  await db
    .delete(ingredients)
    .where(and(eq(ingredients.id, id), eq(ingredients.groupId, groupId)));
  revalidatePath("/pantry");
}

export async function setAvailability(
  id: string,
  available: boolean,
): Promise<void> {
  const groupId = await activeGroupId();
  if (!groupId) return;
  await db
    .update(ingredients)
    .set({ available })
    .where(and(eq(ingredients.id, id), eq(ingredients.groupId, groupId)));
  revalidatePath("/pantry");
}
```

- [ ] `npx tsc --noEmit` → exit 0. Commit:
```bash
git add "src/app/(protected)/pantry/actions.ts"
git commit -m "feat: pantry actions on Drizzle, scoped by group (IDOR fix)"
```

---

## Task 2: Pantry page on Drizzle

- [ ] Replace `src/app/(protected)/pantry/page.tsx` with:
```tsx
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PantryView } from "@/components/pantry/pantry-view";
import { db } from "@/db";
import { ingredients } from "@/db/schema";
import { getActiveGroup } from "@/lib/groups";

export default async function PantryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const group = await getActiveGroup(session.user.id);
  if (!group) redirect("/onboarding");

  const rows = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.groupId, group.id))
    .orderBy(asc(ingredients.name));

  return <PantryView ingredients={rows} />;
}
```

- [ ] `npx tsc --noEmit` → exit 0. Commit:
```bash
git add "src/app/(protected)/pantry/page.tsx"
git commit -m "feat: pantry page reads ingredients via Drizzle"
```

---

## Task 3: Switch the Ingredient type to Drizzle

- [ ] In each of `src/lib/pantry/filter.ts`, `src/components/pantry/ingredient-row.tsx`, `src/components/pantry/ingredient-sheet.tsx`, `src/components/pantry/pantry-view.tsx`: change the import
  `import type { Ingredient } from "@/types/database";` → `import type { Ingredient } from "@/db/schema";`
  (No other code changes — the component fields `id`, `name`, `quantity`, `unit`, `available` are identical in both types.)

- [ ] Update the three pantry component test fixtures (`ingredient-row.test.tsx`, `ingredient-sheet.test.tsx`, `pantry-view.test.tsx`) so the `Ingredient` objects match the Drizzle shape. Replace fixture objects of the form
  `{ id, group_id, name, quantity, unit, available, created_at: "", updated_at: "" }`
  with
  `{ id, groupId: "g", name, quantity, unit, available, createdAt: new Date(), updatedAt: new Date() }`
  (rename `group_id`→`groupId`; `created_at`/`updated_at`→`createdAt`/`updatedAt` as `Date`). Keep all other test logic identical.

- [ ] Run `npm test` → all pass; `npx tsc --noEmit` → exit 0. Commit:
```bash
git add src/lib/pantry/filter.ts src/components/pantry/
git commit -m "refactor: use Drizzle Ingredient type in pantry"
```

---

## Task 4: Remove Supabase

- [ ] Delete the Supabase client files and the obsolete types:
```bash
git rm src/lib/supabase/server.ts src/lib/supabase/client.ts src/types/database.ts
```
(Remove the now-empty `src/lib/supabase/` directory if anything remains.)

- [ ] Confirm nothing still imports Supabase:
```bash
```
Use Grep for `@supabase` and `lib/supabase` across `src/` — expected: **no matches**. If any remain, they must be ported/removed before continuing.

- [ ] Uninstall the packages:
```bash
npm uninstall @supabase/supabase-js @supabase/ssr
```

- [ ] Edit `.env.example`: delete the three Supabase lines (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) and their comments. Keep `GEMINI_API_KEY`, `NEXT_PUBLIC_APP_URL`, `DATABASE_URL`, `AUTH_SECRET`.

- [ ] Verify: `npx tsc --noEmit` (exit 0), `npm run lint` (clean), `npm test` (all pass), and a **plain** build (no Supabase env needed anymore):
```bash
npm run build
```
Expected: "Compiled successfully" with NO Supabase placeholder env vars. Confirm `/pantry` is in the route list.

- [ ] Commit:
```bash
git add -A
git commit -m "chore: remove Supabase deps, client, and types"
```

---

## Task 5: Headless end-to-end verification (against Neon)

- [ ] Create throwaway `scripts/verify-c.mjs` (run `node --env-file=.env.local scripts/verify-c.mjs`) that proves group-scoped pantry isolation, then cleans up:

```js
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = (t, p) => pool.query(t, p);
const stamp = Date.now();
const made = { users: [], groups: [] };

async function user(label) {
  const { rows } = await q(
    `insert into users (id, name, email) values (gen_random_uuid()::text, $1, $2) returning id`,
    [`E2E ${label}`, `e2e-c-${label}-${stamp}@example.com`],
  );
  made.users.push(rows[0].id);
  return rows[0].id;
}
async function group(uid, name) {
  const g = await q(
    `insert into groups (name, invite_code, created_by) values ($1,$2,$3) returning id`,
    [name, "C" + Math.random().toString(36).slice(2, 7).toUpperCase(), uid],
  );
  await q(`insert into group_members (group_id, user_id, role) values ($1,$2,'admin')`, [g.rows[0].id, uid]);
  made.groups.push(g.rows[0].id);
  return g.rows[0].id;
}

try {
  const ua = await user("a"); const ga = await group(ua, "Flat A");
  const ub = await user("b"); const gb = await group(ub, "Flat B");

  // insert an ingredient into group A
  const ing = await q(
    `insert into ingredients (group_id, name, quantity, unit) values ($1,'Potato',2,'kg') returning id`,
    [ga],
  );
  console.log("✓ insert ingredient into group A");

  // group A sees it
  const aSees = await q(`select count(*)::int n from ingredients where group_id = $1`, [ga]);
  if (aSees.rows[0].n !== 1) throw new Error("group A should see its ingredient");

  // group B does NOT see it
  const bSees = await q(`select count(*)::int n from ingredients where group_id = $1`, [gb]);
  if (bSees.rows[0].n !== 0) throw new Error("group B must not see group A's ingredient");
  console.log("✓ group B cannot see group A's ingredient");

  // IDOR check: a group-scoped delete from group B does NOT remove A's row
  const del = await q(`delete from ingredients where id = $1 and group_id = $2`, [ing.rows[0].id, gb]);
  if (del.rowCount !== 0) throw new Error("group B should not be able to delete A's ingredient");
  const still = await q(`select count(*)::int n from ingredients where id = $1`, [ing.rows[0].id]);
  if (still.rows[0].n !== 1) throw new Error("A's ingredient must still exist");
  console.log("✓ group-scoped delete blocks cross-group deletion (IDOR closed)");

  console.log("\n✅ PLAN C PANTRY ISOLATION VERIFIED");
} catch (e) {
  console.error("\n❌ FAIL:", e.message);
  process.exitCode = 1;
} finally {
  for (const gid of made.groups) await q(`delete from groups where id = $1`, [gid]);
  for (const uid of made.users) await q(`delete from users where id = $1`, [uid]);
  await pool.end();
  console.log(`🧹 cleaned ${made.groups.length} group(s), ${made.users.length} user(s)`);
}
```

- [ ] Run → expect all ✓ and "PLAN C PANTRY ISOLATION VERIFIED". Delete the script; do not commit it.

---

## Self-Review
- **Coverage:** pantry read + all three mutations on Drizzle; every query scoped by the session-derived group id (IDOR closed); `Ingredient` type sourced from Drizzle; Supabase client/types/deps removed; `.env.example` cleaned. ✓
- **Security:** no mutation trusts client-supplied group id; update/delete `WHERE` includes `group_id = activeGroup`; duplicate-name now a friendly message instead of a raw DB error. ✓
- **Type consistency:** component field names unchanged (single-word); test fixtures updated to the Drizzle shape; no remaining `@/types/database` imports. ✓
- **No Supabase left:** grep for `@supabase` / `lib/supabase` returns nothing in `src/`. ✓
