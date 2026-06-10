# Hardening & Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix correctness races, timezone handling, AI cost controls, and query inefficiency; add live polling, group lifecycle management, resilience UI, CI, integration tests, and PWA installability.

**Architecture:** All DB-state transitions move into transactions with `SELECT … FOR UPDATE` row locks on `meal_sessions` so vote/finalize/regenerate serialize correctly. Read paths get React `cache()` dedup and batched `inArray` queries. New lib functions stay in `src/lib/*` (pure logic unit-tested; DB logic integration-tested against PGlite via a `vi.mock("@/db")` harness). UI changes are minimal additions to existing client components.

**Tech Stack:** Next.js 16 App Router (note: `error.tsx` receives `unstable_retry`, not `reset`; `searchParams` is a `Promise`), Drizzle ORM + Neon serverless, Auth.js v5 (JWT strategy), zod v4 (`z.url()`), Vitest + Testing Library + `@electric-sql/pglite` (new devDependency).

**Conventions for every task:** Run tests with `npx vitest run <file>` (or `npm test` for all). Commit after each task with the message given. The repo currently has a clean tree on `main`; work directly on a feature branch `improvements` created in Task 1.

---

### Task 1: Env validation, shared db-error helper, registration race fix

**Files:**
- Create: `src/env.ts`
- Create: `src/lib/db-errors.ts`
- Modify: `src/db/index.ts`
- Modify: `src/lib/groups.ts` and `src/app/(protected)/pantry/actions.ts` (shared helper)
- Modify: `src/app/(auth)/actions.ts`
- Modify: `vitest.setup.ts`
- Modify: `package.json` (typecheck script)

- [ ] **Step 1: Create branch**

```bash
git checkout -b improvements
```

- [ ] **Step 2: Create `src/env.ts`**

```ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  // Optional so the app boots without AI; gemini.ts gives a clear error on use.
  GEMINI_API_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

/** Validated at first import — fails fast with a clear message instead of deep runtime errors. */
export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
```

- [ ] **Step 3: Create `src/lib/db-errors.ts`**

```ts
/** True when the error is a Postgres unique-constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}
```

- [ ] **Step 4: Use env in `src/db/index.ts`**

Replace the pool line:

```ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { env } from "@/env";
import * as schema from "./schema";

// Node needs an explicit WebSocket implementation for the Neon Pool.
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool, { schema });
```

- [ ] **Step 5: Set dummy env vars for tests in `vitest.setup.ts`**

Add at the very top of the file (before all imports — module side effects in `@/db` read these):

```ts
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.AUTH_SECRET ??= "test-secret";
```

- [ ] **Step 6: Fix the signup unique-violation race in `src/app/(auth)/actions.ts`**

Keep the friendly pre-check; additionally wrap the insert. Replace the insert block in `signUp`:

```ts
import { isUniqueViolation } from "@/lib/db-errors";
```

```ts
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  try {
    await db.insert(users).values({
      name: parsed.data.name,
      email: parsed.data.email,
      password: passwordHash,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "An account with this email already exists" };
    }
    throw error;
  }
```

- [ ] **Step 7: Replace the local `isUniqueViolation` copies**

In `src/lib/groups.ts` and `src/app/(protected)/pantry/actions.ts`: delete the local `isUniqueViolation` function and add `import { isUniqueViolation } from "@/lib/db-errors";`.

- [ ] **Step 8: Add typecheck script to `package.json`**

In `"scripts"`, after `"lint"`:

```json
    "typecheck": "tsc --noEmit",
```

- [ ] **Step 9: Verify**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all existing tests PASS.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: validate env at startup, share unique-violation helper, fix signup race"
```

---

### Task 2: Schema migration — group timezone, generation cooldown, drop unused auth tables

**Files:**
- Modify: `src/db/schema.ts`
- Create (generated): `drizzle/0001_*.sql` via drizzle-kit

- [ ] **Step 1: Edit `src/db/schema.ts`**

1. Delete the `sessions` table (lines 60–66) and the `verificationTokens` table (lines 68–76) — auth is JWT-strategy; they are unused. **Keep `accounts`** for future Google OAuth.
2. In `groups`, after `inviteCode`:

```ts
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
```

3. In `mealSessions`, after `status`:

```ts
    lastGeneratedAt: timestamp("last_generated_at"),
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/0001_<name>.sql` containing `DROP TABLE "sessions"`, `DROP TABLE "verification_tokens"`, `ALTER TABLE "groups" ADD COLUMN "timezone" text DEFAULT 'Asia/Kolkata' NOT NULL`, and `ALTER TABLE "meal_sessions" ADD COLUMN "last_generated_at" timestamp`.

- [ ] **Step 3: Apply the migration**

Run: `npm run db:migrate`
Expected: completes without error (uses `.env.local`).

- [ ] **Step 4: Fix test fixtures for the widened `MealSession` type**

In `src/components/dashboard/dashboard-view.test.tsx`, add `lastGeneratedAt: null` to `sessBase`:

```ts
const sessBase = { groupId: "g", sessionDate: "2026-06-05", status: "open" as const, createdAt: new Date(), lastGeneratedAt: null };
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add group timezone + generation cooldown columns, drop unused auth tables"
```

---

### Task 3: PGlite integration-test harness

**Files:**
- Create: `src/test/db.ts`
- Modify: `package.json` / lockfile (new devDependency)

- [ ] **Step 1: Install PGlite**

Run: `npm install -D @electric-sql/pglite`

- [ ] **Step 2: Create `src/test/db.ts`**

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "@/db/schema";

/**
 * In-memory Postgres with the real migrations applied.
 * Use from a test file via:
 *   vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
 */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}
```

- [ ] **Step 3: Smoke-test the harness — create `src/test/db.test.ts`**

```ts
// @vitest-environment node
import { expect, test } from "vitest";

import { users } from "@/db/schema";
import { createTestDb } from "./db";

test("PGlite harness applies migrations and accepts inserts", async () => {
  const db = await createTestDb();
  await db.insert(users).values({ id: "u1", email: "a@b.c", name: "A" });
  const rows = await db.select().from(users);
  expect(rows).toHaveLength(1);
});
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/test/db.test.ts`
Expected: PASS (first run downloads nothing; PGlite WASM ships in the package).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: add PGlite integration-test harness"
```

---

### Task 4: Timezone-correct session dates

**Files:**
- Modify: `src/lib/sessions.ts`
- Modify: `src/lib/sessions.test.ts`
- Modify: `src/lib/groups.ts` (GroupContext gains timezone)
- Modify: `src/app/(protected)/dashboard/page.tsx` (pass timezone)

- [ ] **Step 1: Write the failing tests** — in `src/lib/sessions.test.ts` replace the `toDateString` test:

```ts
test("toDateString formats Y-M-D in the given timezone", () => {
  // 20:00 UTC on Jun 5 is already Jun 6, 01:30 in Kolkata.
  const d = new Date("2026-06-05T20:00:00Z");
  expect(toDateString(d, "Asia/Kolkata")).toBe("2026-06-06");
  expect(toDateString(d, "UTC")).toBe("2026-06-05");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/sessions.test.ts`
Expected: FAIL (signature mismatch).

- [ ] **Step 3: Implement** — in `src/lib/sessions.ts` replace `toDateString` and thread the zone through:

```ts
/** YYYY-MM-DD for the given instant in the given IANA timezone. */
export function toDateString(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
```

```ts
export async function getOrCreateTodaySessions(
  groupId: string,
  timezone: string,
): Promise<{ lunch: MealSession; dinner: MealSession }> {
  const date = toDateString(new Date(), timezone);
  // … rest unchanged
```

- [ ] **Step 4: Expose timezone on GroupContext** — in `src/lib/groups.ts`:

```ts
export interface GroupContext {
  id: string;
  name: string;
  timezone: string;
  role: "admin" | "member";
  memberCount: number;
}
```

and in `getGroupContext`'s select add `timezone: groups.timezone,`.

- [ ] **Step 5: Pass it in `src/app/(protected)/dashboard/page.tsx`**

```ts
const { lunch, dinner } = await getOrCreateTodaySessions(group.id, group.timezone);
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix: compute session dates in the group's timezone"
```

---

### Task 5: Race-safe voting and finalization

**Files:**
- Modify: `src/lib/votes.ts`
- Create: `src/lib/votes.integration.test.ts`

- [ ] **Step 1: Write failing integration tests** — create `src/lib/votes.integration.test.ts`:

```ts
// @vitest-environment node
import { beforeAll, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

import { db } from "@/db";
import { groupMembers, groups, mealSessions, mealSuggestions, users } from "@/db/schema";
import { castVoteForUser, finalizeSessionForGroup } from "./votes";

let groupId: string;
let sessionId: string;
let sugA: string;
let sugB: string;

beforeAll(async () => {
  await db.insert(users).values([
    { id: "admin", email: "admin@x.y" },
    { id: "m1", email: "m1@x.y" },
  ]);
  const [g] = await db
    .insert(groups)
    .values({ name: "Flat", inviteCode: "AAAAAA", createdBy: "admin" })
    .returning({ id: groups.id });
  groupId = g.id;
  await db.insert(groupMembers).values([
    { groupId, userId: "admin", role: "admin" },
    { groupId, userId: "m1", role: "member" },
  ]);
  const [s] = await db
    .insert(mealSessions)
    .values({ groupId, sessionDate: "2026-06-11", mealType: "lunch" })
    .returning({ id: mealSessions.id });
  sessionId = s.id;
  const sugs = await db
    .insert(mealSuggestions)
    .values([
      { sessionId, mealName: "Egg Fried Rice", requiredIngredients: ["egg", "rice"] },
      { sessionId, mealName: "Aloo Jeera", requiredIngredients: ["potato"] },
    ])
    .returning({ id: mealSuggestions.id });
  [sugA, sugB] = [sugs[0].id, sugs[1].id];
});

test("first vote flips the session to voting", async () => {
  const err = await castVoteForUser("m1", groupId, sessionId, sugA);
  expect(err).toBeNull();
  const [s] = await db.select().from(mealSessions);
  expect(s.status).toBe("voting");
});

test("a vote can be moved to another suggestion", async () => {
  const err = await castVoteForUser("m1", groupId, sessionId, sugB);
  expect(err).toBeNull();
});

test("voting for a suggestion from another session is rejected", async () => {
  const err = await castVoteForUser("m1", groupId, sessionId, crypto.randomUUID());
  expect(err).toBe("Invalid choice");
});

test("non-admin cannot finalize", async () => {
  expect(await finalizeSessionForGroup("m1", groupId, false, sessionId)).toBe(
    "Only an admin can finalize",
  );
});

test("finalize picks the winner and votes are closed afterwards", async () => {
  const err = await finalizeSessionForGroup("admin", groupId, true, sessionId);
  expect(err).toBeNull();
  const [s] = await db.select().from(mealSessions);
  expect(s.status).toBe("finalized");
  expect(await castVoteForUser("m1", groupId, sessionId, sugA)).toBe("Voting is closed");
  expect(await finalizeSessionForGroup("admin", groupId, true, sessionId)).toBe(
    "Already finalized",
  );
});

test("finalize with zero votes returns an error and changes nothing", async () => {
  const [s2] = await db
    .insert(mealSessions)
    .values({ groupId, sessionDate: "2026-06-12", mealType: "lunch" })
    .returning({ id: mealSessions.id });
  await db.insert(mealSuggestions).values({ sessionId: s2.id, mealName: "Poha", requiredIngredients: [] });
  expect(await finalizeSessionForGroup("admin", groupId, true, s2.id)).toBe("No votes yet");
});
```

- [ ] **Step 2: Run to verify current behavior** — `npx vitest run src/lib/votes.integration.test.ts`. The tests largely pass against the old code (they pin behavior); proceed to make the implementation atomic.

- [ ] **Step 3: Rewrite `castVoteForUser` and `finalizeSessionForGroup` in `src/lib/votes.ts`** (delete the `sessionInGroup` helper):

```ts
/** Cast or move the user's single vote for a session. Returns an error string or null. */
export async function castVoteForUser(
  userId: string,
  groupId: string,
  sessionId: string,
  suggestionId: string,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    // Row lock: serializes against finalize and regenerate for this session.
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

    const [sug] = await tx
      .select({ id: mealSuggestions.id })
      .from(mealSuggestions)
      .where(
        and(eq(mealSuggestions.id, suggestionId), eq(mealSuggestions.sessionId, sessionId)),
      )
      .limit(1);
    if (!sug) return "Invalid choice";

    // Flip to "voting" before the vote lands so regenerate (which requires
    // status "open" under the same row lock) can never cascade-delete it.
    if (session.status === "open") {
      await tx
        .update(mealSessions)
        .set({ status: "voting" })
        .where(eq(mealSessions.id, sessionId));
    }

    await tx
      .insert(votes)
      .values({ sessionId, suggestionId, userId })
      .onConflictDoUpdate({
        target: [votes.sessionId, votes.userId],
        set: { suggestionId },
      });
    return null;
  });
}

/** Admin-only finalize: pick the winner and lock the session. Returns error or null. */
export async function finalizeSessionForGroup(
  userId: string,
  groupId: string,
  isAdmin: boolean,
  sessionId: string,
): Promise<string | null> {
  if (!isAdmin) return "Only an admin can finalize";
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(mealSessions)
      .where(and(eq(mealSessions.id, sessionId), eq(mealSessions.groupId, groupId)))
      .limit(1)
      .for("update");
    if (!session) return "Session not found";
    if (session.status === "finalized") return "Already finalized";

    // Tally inside the transaction: the row lock blocks concurrent casts,
    // so the count cannot change between tally and status flip.
    const rows = await tx
      .select({
        id: mealSuggestions.id,
        mealName: mealSuggestions.mealName,
        createdAt: mealSuggestions.createdAt,
        votes: sql<number>`count(${votes.id})::int`,
      })
      .from(mealSuggestions)
      .leftJoin(votes, eq(votes.suggestionId, mealSuggestions.id))
      .where(eq(mealSuggestions.sessionId, sessionId))
      .groupBy(mealSuggestions.id);

    const winnerId = pickWinner(
      rows.map((r) => ({ id: r.id, votes: r.votes, createdAt: r.createdAt })),
    );
    if (!winnerId) return "No votes yet";
    const winner = rows.find((r) => r.id === winnerId)!;

    await tx.insert(finalizedMeals).values({
      sessionId,
      suggestionId: winner.id,
      mealName: winner.mealName,
      finalizedBy: userId,
    });
    await tx
      .update(mealSessions)
      .set({ status: "finalized" })
      .where(eq(mealSessions.id, sessionId));
    return null;
  });
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run src/lib/votes.integration.test.ts src/lib/votes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: make vote casting and finalization atomic with session row locks"
```

---

### Task 6: Race-safe, rate-limited suggestion generation

**Files:**
- Create: `src/lib/suggestions.ts`
- Create: `src/lib/suggestions.integration.test.ts`
- Modify: `src/app/(protected)/dashboard/actions.ts`

- [ ] **Step 1: Write failing integration tests** — create `src/lib/suggestions.integration.test.ts`:

```ts
// @vitest-environment node
import { beforeAll, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

import { db } from "@/db";
import { groups, mealSessions, mealSuggestions, users, votes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { claimGeneration, replaceSuggestions } from "./suggestions";

let groupId: string;
let sessionId: string;

beforeAll(async () => {
  await db.insert(users).values({ id: "u1", email: "u1@x.y" });
  const [g] = await db
    .insert(groups)
    .values({ name: "Flat", inviteCode: "BBBBBB", createdBy: "u1" })
    .returning({ id: groups.id });
  groupId = g.id;
  const [s] = await db
    .insert(mealSessions)
    .values({ groupId, sessionDate: "2026-06-11", mealType: "dinner" })
    .returning({ id: mealSessions.id });
  sessionId = s.id;
});

test("first claim succeeds, immediate second claim is cooldown-blocked", async () => {
  const first = await claimGeneration(sessionId, groupId);
  expect("session" in first && first.session.mealType).toBe("dinner");
  const second = await claimGeneration(sessionId, groupId);
  expect(second).toEqual({ error: "Please wait a moment before regenerating." });
});

test("claim on an unknown session errors", async () => {
  expect(await claimGeneration(crypto.randomUUID(), groupId)).toEqual({
    error: "Session not found",
  });
});

test("replaceSuggestions swaps the list while open", async () => {
  const err = await replaceSuggestions(sessionId, [
    { mealName: "Poha", requiredIngredients: ["poha"] },
  ]);
  expect(err).toBeNull();
  const rows = await db.select().from(mealSuggestions);
  expect(rows.map((r) => r.mealName)).toEqual(["Poha"]);
});

test("replaceSuggestions refuses once voting has started (votes survive)", async () => {
  const [sug] = await db.select().from(mealSuggestions).limit(1);
  await db.insert(votes).values({ sessionId, suggestionId: sug.id, userId: "u1" });
  await db
    .update(mealSessions)
    .set({ status: "voting" })
    .where(eq(mealSessions.id, sessionId));

  const err = await replaceSuggestions(sessionId, [
    { mealName: "Upma", requiredIngredients: [] },
  ]);
  expect(err).toBe("Voting has started — regenerate is locked.");
  expect(await db.select().from(votes)).toHaveLength(1);
});

test("claim refuses once voting has started", async () => {
  expect(await claimGeneration(sessionId, groupId)).toEqual({
    error: "Voting has started — regenerate is locked.",
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/suggestions.integration.test.ts` → FAIL (module missing).

- [ ] **Step 3: Create `src/lib/suggestions.ts`**

```ts
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { mealSessions, mealSuggestions, type MealSession } from "@/db/schema";
import type { Suggestion } from "@/lib/ai/parse";

export const GENERATE_COOLDOWN_SECONDS = 30;

export type ClaimResult = { error: string } | { session: MealSession };

/**
 * Atomically claim the right to generate for a session: only while "open" and
 * at most once per cooldown window. The guarded UPDATE is the rate limiter —
 * concurrent claims race on the same row and exactly one wins.
 */
export async function claimGeneration(
  sessionId: string,
  groupId: string,
): Promise<ClaimResult> {
  const claimed = await db
    .update(mealSessions)
    .set({ lastGeneratedAt: sql`now()` })
    .where(
      and(
        eq(mealSessions.id, sessionId),
        eq(mealSessions.groupId, groupId),
        eq(mealSessions.status, "open"),
        sql`(${mealSessions.lastGeneratedAt} is null or ${mealSessions.lastGeneratedAt} < now() - interval '${sql.raw(String(GENERATE_COOLDOWN_SECONDS))} seconds')`,
      ),
    )
    .returning();
  if (claimed.length > 0) return { session: claimed[0] };

  const [session] = await db
    .select()
    .from(mealSessions)
    .where(and(eq(mealSessions.id, sessionId), eq(mealSessions.groupId, groupId)))
    .limit(1);
  if (!session) return { error: "Session not found" };
  if (session.status !== "open") {
    return { error: "Voting has started — regenerate is locked." };
  }
  return { error: "Please wait a moment before regenerating." };
}

/** Replace a session's suggestions, only while it is still open. Error string or null. */
export async function replaceSuggestions(
  sessionId: string,
  items: Suggestion[],
): Promise<string | null> {
  return db.transaction(async (tx) => {
    // Row lock + status re-check: a vote flipping the session to "voting"
    // can never interleave with this delete, so votes are never cascaded away.
    const [session] = await tx
      .select()
      .from(mealSessions)
      .where(eq(mealSessions.id, sessionId))
      .limit(1)
      .for("update");
    if (!session || session.status !== "open") {
      return "Voting has started — regenerate is locked.";
    }
    await tx.delete(mealSuggestions).where(eq(mealSuggestions.sessionId, sessionId));
    if (items.length > 0) {
      await tx.insert(mealSuggestions).values(
        items.map((s) => ({
          sessionId,
          mealName: s.mealName,
          requiredIngredients: s.requiredIngredients,
          aiGenerated: true,
        })),
      );
    }
    return null;
  });
}
```

- [ ] **Step 4: Run integration tests** — `npx vitest run src/lib/suggestions.integration.test.ts` → PASS.

- [ ] **Step 5: Rewrite `src/app/(protected)/dashboard/actions.ts` to use the lib**

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { generateMealSuggestions } from "@/lib/ai/gemini";
import { getActiveGroup } from "@/lib/groups";
import { claimGeneration, replaceSuggestions } from "@/lib/suggestions";
import {
  getAvailableIngredientNames,
  getRecentMealNames,
} from "@/lib/sessions";

export type GenerateState = { error?: string };

export async function generateSuggestions(sessionId: string): Promise<GenerateState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const group = await getActiveGroup(session.user.id);
  if (!group) redirect("/onboarding");

  // Claim first: enforces group ownership, "open" status, and the cooldown
  // before we spend an AI call.
  const claim = await claimGeneration(sessionId, group.id);
  if ("error" in claim) return { error: claim.error };

  const [available, recent] = await Promise.all([
    getAvailableIngredientNames(group.id),
    getRecentMealNames(group.id, 10),
  ]);

  let suggestions;
  try {
    suggestions = await generateMealSuggestions({
      availableIngredients: available,
      recentMeals: recent,
      mealType: claim.session.mealType,
    });
  } catch {
    return { error: "Could not reach the AI. Please try again." };
  }

  const replaceError = await replaceSuggestions(sessionId, suggestions);
  if (replaceError) return { error: replaceError };

  revalidatePath("/dashboard");
  return {};
}
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix: atomic suggestion regeneration with per-session cooldown"
```

---

### Task 7: Gemini hardening + prompt spelling alignment

**Files:**
- Modify: `src/lib/ai/gemini.ts`
- Modify: `src/lib/ai/prompt.ts`
- Modify: `src/lib/ai/prompt.test.ts`

- [ ] **Step 1: Write the failing prompt test** — add to `src/lib/ai/prompt.test.ts`:

```ts
test("instructs the model to reuse exact pantry spellings", () => {
  const p = buildSuggestionPrompt({
    availableIngredients: ["rice"],
    recentMeals: [],
    mealType: "lunch",
  });
  expect(p).toMatch(/exact spelling from the available list/i);
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/ai/prompt.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `src/lib/ai/prompt.ts`, after the "For each dish…" line add:

```ts
    "When a required ingredient matches one of the available ingredients, use the exact spelling from the available list.",
```

- [ ] **Step 4: Harden `src/lib/ai/gemini.ts`** — key in header (not URL), request timeout, env module:

```ts
import { env } from "@/env";
import { buildSuggestionPrompt, type SuggestionInput } from "./prompt";
import { parseSuggestions, type Suggestion } from "./parse";

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const REQUEST_TIMEOUT_MS = 15_000;
```

and replace the fetch:

```ts
export async function generateMealSuggestions(
  input: SuggestionInput,
): Promise<Suggestion[]> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildSuggestionPrompt(input) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  // … rest unchanged
```

- [ ] **Step 5: Verify** — `npm run typecheck && npx vitest run src/lib/ai` → PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: move Gemini key to header, add request timeout, align prompt spellings"
```

---

### Task 8: Plural-tolerant ingredient matching

**Files:**
- Modify: `src/lib/sessions.ts`
- Modify: `src/lib/sessions.test.ts`

- [ ] **Step 1: Write failing tests** — add to `src/lib/sessions.test.ts`:

```ts
test("missingIngredients tolerates plural/singular and whitespace differences", () => {
  expect(missingIngredients(["tomatoes"], ["Tomato"])).toEqual([]);
  expect(missingIngredients(["egg"], ["eggs"])).toEqual([]);
  expect(missingIngredients(["chillies"], ["chilly"])).toEqual([]);
  expect(missingIngredients(["green  chilli"], ["green chilli"])).toEqual([]);
  expect(missingIngredients(["paneer"], ["peas"])).toEqual(["paneer"]);
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/sessions.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `src/lib/sessions.ts` replace `missingIngredients`:

```ts
/** Lowercased, whitespace-collapsed, naive-singular form for matching. */
function normalizeIngredient(name: string): string {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (n.length <= 3) return n;
  if (n.endsWith("ies")) return `${n.slice(0, -3)}y`; // chillies -> chilly
  if (n.endsWith("oes")) return n.slice(0, -2); // tomatoes -> tomato
  if (n.endsWith("s") && !n.endsWith("ss")) return n.slice(0, -1); // eggs -> egg
  return n;
}

/** Required ingredients not present (plural/case-insensitive) in the available list. */
export function missingIngredients(required: string[], available: string[]): string[] {
  const have = new Set(available.map(normalizeIngredient));
  return required.filter((r) => !have.has(normalizeIngredient(r)));
}
```

- [ ] **Step 4: Verify** — `npx vitest run src/lib/sessions.test.ts` → PASS (including the pre-existing case-insensitivity test).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: plural-tolerant ingredient matching"
```

---

### Task 9: Request-level caching + batched dashboard queries

**Files:**
- Modify: `src/lib/groups.ts`
- Modify: `src/lib/votes.ts`
- Create: `src/lib/vote-state.test.ts`
- Modify: `src/app/(protected)/dashboard/page.tsx`
- Modify: `src/app/(protected)/layout.tsx`

- [ ] **Step 1: Wrap group lookups in React `cache()`** — in `src/lib/groups.ts`:

```ts
import { cache } from "react";
```

```ts
export const getActiveGroup = cache(
  async (userId: string): Promise<ActiveGroup | null> => {
    // body unchanged
  },
);
```

```ts
export const getGroupContext = cache(
  async (userId: string): Promise<GroupContext | null> => {
    // body unchanged
  },
);
```

- [ ] **Step 2: Share the cached context with the layout** — in `src/app/(protected)/layout.tsx` replace `getActiveGroup` with `getGroupContext` (same null-redirect; `group.name` still available). The layout and page now share one cached lookup per request.

- [ ] **Step 3: Write failing tests for the pure vote-state builder** — create `src/lib/vote-state.test.ts`:

```ts
import { expect, test } from "vitest";

import { buildVoteState } from "./votes";

const sug = (id: string, sessionId: string, name: string) => ({
  id,
  sessionId,
  mealName: name,
  requiredIngredients: [] as string[],
});

test("groups suggestions and votes per session, flags my vote", () => {
  const state = buildVoteState(
    ["s1", "s2"],
    [sug("a", "s1", "Rice"), sug("b", "s1", "Dal"), sug("c", "s2", "Poha")],
    [
      { sessionId: "s1", suggestionId: "a", userId: "me" },
      { sessionId: "s1", suggestionId: "a", userId: "other" },
      { sessionId: "s2", suggestionId: "c", userId: "other" },
    ],
    "me",
  );
  const s1 = state.get("s1")!;
  expect(s1.totalVoters).toBe(2);
  expect(s1.suggestions.find((s) => s.id === "a")).toMatchObject({ votes: 2, mine: true });
  expect(s1.suggestions.find((s) => s.id === "b")).toMatchObject({ votes: 0, mine: false });
  expect(state.get("s2")!.totalVoters).toBe(1);
});

test("sessions with no suggestions still get an empty state", () => {
  const state = buildVoteState(["s1"], [], [], "me");
  expect(state.get("s1")).toEqual({ suggestions: [], totalVoters: 0 });
});
```

- [ ] **Step 4: Run to verify failure** — `npx vitest run src/lib/vote-state.test.ts` → FAIL.

- [ ] **Step 5: Implement batched reads in `src/lib/votes.ts`** — delete `getSessionVoteState`, `getFinalizedMeal`, and add (`inArray` joins the drizzle import):

```ts
/** Pure: per-session vote state from raw rows. Exported for tests. */
export function buildVoteState(
  sessionIds: string[],
  suggestions: {
    id: string;
    sessionId: string;
    mealName: string;
    requiredIngredients: string[];
  }[],
  voteRows: { sessionId: string; suggestionId: string; userId: string }[],
  userId: string,
): Map<string, SessionVoteState> {
  const state = new Map<string, SessionVoteState>(
    sessionIds.map((id) => [id, { suggestions: [], totalVoters: 0 }]),
  );

  const counts = new Map<string, number>();
  const mine = new Set<string>();
  for (const v of voteRows) {
    counts.set(v.suggestionId, (counts.get(v.suggestionId) ?? 0) + 1);
    if (v.userId === userId) mine.add(v.suggestionId);
    const s = state.get(v.sessionId);
    if (s) s.totalVoters += 1;
  }

  for (const sug of suggestions) {
    state.get(sug.sessionId)?.suggestions.push({
      id: sug.id,
      mealName: sug.mealName,
      requiredIngredients: sug.requiredIngredients,
      votes: counts.get(sug.id) ?? 0,
      mine: mine.has(sug.id),
    });
  }
  return state;
}

/** Vote state for several sessions in two queries. */
export async function getVoteStateForSessions(
  sessionIds: string[],
  userId: string,
): Promise<Map<string, SessionVoteState>> {
  if (sessionIds.length === 0) return new Map();
  const suggestions = await db
    .select()
    .from(mealSuggestions)
    .where(inArray(mealSuggestions.sessionId, sessionIds))
    .orderBy(mealSuggestions.createdAt);
  const voteRows = await db
    .select({
      sessionId: votes.sessionId,
      suggestionId: votes.suggestionId,
      userId: votes.userId,
    })
    .from(votes)
    .where(inArray(votes.sessionId, sessionIds));
  return buildVoteState(sessionIds, suggestions, voteRows, userId);
}

/** Finalized meal names keyed by session id. */
export async function getFinalizedMealsForSessions(
  sessionIds: string[],
): Promise<Map<string, { mealName: string }>> {
  if (sessionIds.length === 0) return new Map();
  const rows = await db
    .select({ sessionId: finalizedMeals.sessionId, mealName: finalizedMeals.mealName })
    .from(finalizedMeals)
    .where(inArray(finalizedMeals.sessionId, sessionIds));
  return new Map(rows.map((r) => [r.sessionId, { mealName: r.mealName }]));
}
```

- [ ] **Step 6: Rewrite `src/app/(protected)/dashboard/page.tsx`**

```tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DashboardView, type SessionBundle } from "@/components/dashboard/dashboard-view";
import { getGroupContext } from "@/lib/groups";
import { getAvailableIngredientNames, getOrCreateTodaySessions } from "@/lib/sessions";
import { getFinalizedMealsForSessions, getVoteStateForSessions } from "@/lib/votes";
import type { MealSession } from "@/db/schema";

export default async function DashboardPage() {
  const authed = await auth();
  if (!authed?.user?.id) redirect("/login");
  const userId = authed.user.id;

  const group = await getGroupContext(userId);
  if (!group) redirect("/onboarding");

  const { lunch, dinner } = await getOrCreateTodaySessions(group.id, group.timezone);
  const ids = [lunch.id, dinner.id];
  const [voteStates, finalized, available] = await Promise.all([
    getVoteStateForSessions(ids, userId),
    getFinalizedMealsForSessions(ids),
    getAvailableIngredientNames(group.id),
  ]);

  const bundle = (session: MealSession): SessionBundle => ({
    session,
    suggestions: voteStates.get(session.id)?.suggestions ?? [],
    totalVoters: voteStates.get(session.id)?.totalVoters ?? 0,
    finalized: finalized.get(session.id) ?? null,
  });

  return (
    <DashboardView
      available={available}
      isAdmin={group.role === "admin"}
      memberCount={group.memberCount}
      lunch={bundle(lunch)}
      dinner={bundle(dinner)}
    />
  );
}
```

- [ ] **Step 7: Verify** — `npm run typecheck && npm test` → PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "perf: request-level group caching and batched dashboard queries"
```

---

### Task 10: Live dashboard polling

**Files:**
- Modify: `src/components/dashboard/dashboard-view.tsx`
- Modify: `src/components/dashboard/dashboard-view.test.tsx`

- [ ] **Step 1: Write the failing test** — in `dashboard-view.test.tsx`, add the router mock next to the other mocks (top of file):

```ts
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
```

and the tests at the bottom:

```ts
test("polls for updates while a session is undecided", () => {
  vi.useFakeTimers();
  refreshMock.mockClear();
  render(<DashboardView {...props} />);
  vi.advanceTimersByTime(9000);
  expect(refreshMock).toHaveBeenCalled();
  vi.useRealTimers();
});

test("does not poll once both sessions are finalized", () => {
  vi.useFakeTimers();
  refreshMock.mockClear();
  const done = (b: typeof lunch) => ({
    ...b,
    session: { ...b.session, status: "finalized" as const },
    finalized: { mealName: "X" },
  });
  render(<DashboardView {...props} lunch={done(lunch)} dinner={done(dinner)} />);
  vi.advanceTimersByTime(20000);
  expect(refreshMock).not.toHaveBeenCalled();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/components/dashboard/dashboard-view.test.tsx` → the new tests FAIL.

- [ ] **Step 3: Implement** — in `dashboard-view.tsx`:

```tsx
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
```

and inside `DashboardView`, before the return:

```tsx
  const router = useRouter();
  const allSettled = Boolean(lunch.finalized && dinner.finalized);

  // Flatmates vote from their own phones — poll so their votes show up live.
  useEffect(() => {
    if (allSettled) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 8000);
    return () => clearInterval(id);
  }, [allSettled, router]);
```

- [ ] **Step 4: Verify** — `npx vitest run src/components/dashboard/dashboard-view.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: poll for live vote updates on the dashboard"
```

---

### Task 11: In-memory rate limiting for auth and join

**Files:**
- Create: `src/lib/rate-limit.ts`
- Create: `src/lib/rate-limit.test.ts`
- Modify: `src/app/(auth)/actions.ts`
- Modify: `src/app/onboarding/actions.ts` (join only; full rewrite comes in Task 12 — apply this limiter there as part of that rewrite if executing out of order)

- [ ] **Step 1: Write failing tests** — create `src/lib/rate-limit.test.ts`:

```ts
import { beforeEach, expect, test } from "vitest";

import { rateLimit, resetRateLimits } from "./rate-limit";

beforeEach(() => resetRateLimits());

test("allows up to the limit within a window", () => {
  expect(rateLimit("k", 2, 1000, 0)).toBe(true);
  expect(rateLimit("k", 2, 1000, 10)).toBe(true);
  expect(rateLimit("k", 2, 1000, 20)).toBe(false);
});

test("window expiry resets the budget", () => {
  expect(rateLimit("k", 1, 1000, 0)).toBe(true);
  expect(rateLimit("k", 1, 1000, 999)).toBe(false);
  expect(rateLimit("k", 1, 1000, 1000)).toBe(true);
});

test("keys are independent", () => {
  expect(rateLimit("a", 1, 1000, 0)).toBe(true);
  expect(rateLimit("b", 1, 1000, 0)).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/rate-limit.test.ts` → FAIL.

- [ ] **Step 3: Create `src/lib/rate-limit.ts`**

```ts
/**
 * Fixed-window in-memory rate limiter. Per server instance only — good enough
 * to blunt brute force on a small deployment; swap for a Redis-backed limiter
 * (e.g. @upstash/ratelimit) if the app outgrows a single instance.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/rate-limit.test.ts` → PASS.

- [ ] **Step 5: Apply to auth actions** — in `src/app/(auth)/actions.ts` add `import { rateLimit } from "@/lib/rate-limit";`. In `signIn`, after the parse succeeds:

```ts
  if (!rateLimit(`signin:${parsed.data.email}`, 5, 60_000)) {
    return { error: "Too many attempts. Try again in a minute." };
  }
```

In `signUp`, after the parse succeeds:

```ts
  if (!rateLimit(`signup:${parsed.data.email}`, 3, 60_000)) {
    return { error: "Too many attempts. Try again in a minute." };
  }
```

- [ ] **Step 6: Verify** — `npm run typecheck && npm test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: rate-limit sign-in and sign-up attempts"
```

---

### Task 12: Group lifecycle — lib functions and guards

**Files:**
- Modify: `src/lib/groups.ts`
- Create: `src/lib/groups.integration.test.ts`
- Modify: `src/app/onboarding/actions.ts`

- [ ] **Step 1: Write failing integration tests** — create `src/lib/groups.integration.test.ts`:

```ts
// @vitest-environment node
import { beforeAll, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { groupMembers, groups, users } from "@/db/schema";
import {
  createGroupForUser,
  getActiveGroup,
  joinGroupForUser,
  leaveGroupForUser,
  promoteMemberToAdmin,
  removeMemberFromGroup,
  rotateGroupInviteCode,
} from "./groups";

beforeAll(async () => {
  await db.insert(users).values([
    { id: "alice", email: "alice@x.y" },
    { id: "bob", email: "bob@x.y" },
    { id: "cara", email: "cara@x.y" },
  ]);
});

test("create + join via invite code", async () => {
  const created = await createGroupForUser("alice", "Flat 302");
  expect(created.groupId).toBeTruthy();
  const [g] = await db.select().from(groups).where(eq(groups.id, created.groupId!));
  const joined = await joinGroupForUser("bob", g.inviteCode.toLowerCase());
  expect(joined.groupId).toBe(g.id);
});

test("a user already in a group cannot create or join another", async () => {
  expect((await createGroupForUser("alice", "Second")).error).toMatch(/already in a group/i);
  expect((await joinGroupForUser("bob", "ZZZZZZ")).error).toMatch(/already in a group/i);
});

test("joining with an unknown code errors", async () => {
  expect((await joinGroupForUser("cara", "ZZZZZZ")).error).toBe(
    "No group found for that code",
  );
});

test("admin can promote and remove members; non-admin cannot", async () => {
  expect(await removeMemberFromGroup("bob", "alice")).toBe(
    "Only an admin can remove members",
  );
  expect(await promoteMemberToAdmin("alice", "bob")).toBeNull();
  // bob is now admin too; alice can leave even though others remain
  expect(await leaveGroupForUser("alice")).toBeNull();
  expect(await getActiveGroup("alice")).toBeNull();
});

test("sole admin with other members cannot leave", async () => {
  const g = await getActiveGroup("bob");
  await joinGroupForUser("cara", (await db.select().from(groups).where(eq(groups.id, g!.id)))[0].inviteCode);
  expect(await leaveGroupForUser("bob")).toMatch(/promote another member/i);
});

test("admin can remove a member", async () => {
  expect(await removeMemberFromGroup("bob", "cara")).toBeNull();
  expect(await getActiveGroup("cara")).toBeNull();
});

test("rotate invite code changes it (admin only)", async () => {
  const g = await getActiveGroup("bob");
  const before = (await db.select().from(groups).where(eq(groups.id, g!.id)))[0].inviteCode;
  expect((await rotateGroupInviteCode("cara")).error).toMatch(/only an admin/i);
  const rotated = await rotateGroupInviteCode("bob");
  expect(rotated.code).toBeTruthy();
  expect(rotated.code).not.toBe(before);
});

test("last member leaving deletes the group", async () => {
  const g = await getActiveGroup("bob");
  expect(await leaveGroupForUser("bob")).toBeNull();
  expect(await db.select().from(groups).where(eq(groups.id, g!.id))).toHaveLength(0);
  expect(await db.select().from(groupMembers)).toHaveLength(0);
});
```

Note: `getActiveGroup` is wrapped in React `cache()` (Task 9). In the test environment `cache` is a passthrough, so repeated calls hit the DB and observe fresh state.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/groups.integration.test.ts` → FAIL (functions missing / signatures differ).

- [ ] **Step 3: Implement in `src/lib/groups.ts`**

Change imports to include `and`:

```ts
import { and, asc, eq, sql } from "drizzle-orm";
```

Add a tx-or-db type and membership helper near the top (after `ActiveGroup`):

```ts
type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The user's earliest membership row, or null. */
async function membershipOf(client: DbClient, userId: string) {
  const [m] = await client
    .select({
      id: groupMembers.id,
      groupId: groupMembers.groupId,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .orderBy(asc(groupMembers.joinedAt))
    .limit(1);
  return m ?? null;
}
```

Replace `createGroupForUser` and `joinGroupForUser` with result-object versions:

```ts
export type GroupResult = { groupId?: string; error?: string };

/** Create a group with the user as admin (transaction; retries on code collision). */
export async function createGroupForUser(
  userId: string,
  name: string,
): Promise<GroupResult> {
  if (await membershipOf(db, userId)) {
    return { error: "You're already in a group. Leave it from Settings first." };
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = inviteCode();
    try {
      const groupId = await db.transaction(async (tx) => {
        const [group] = await tx
          .insert(groups)
          .values({ name, inviteCode: code, createdBy: userId })
          .returning({ id: groups.id });
        await tx
          .insert(groupMembers)
          .values({ groupId: group.id, userId, role: "admin" });
        return group.id;
      });
      return { groupId };
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 4) continue;
      throw error;
    }
  }
  return { error: "Could not generate a unique invite code" };
}

/** Join a group by invite code. */
export async function joinGroupForUser(
  userId: string,
  code: string,
): Promise<GroupResult> {
  if (await membershipOf(db, userId)) {
    return { error: "You're already in a group. Leave it from Settings first." };
  }
  const normalized = code.trim().toUpperCase();
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.inviteCode, normalized))
    .limit(1);
  if (!group) return { error: "No group found for that code" };

  await db
    .insert(groupMembers)
    .values({ groupId: group.id, userId, role: "member" })
    .onConflictDoNothing({ target: [groupMembers.groupId, groupMembers.userId] });

  return { groupId: group.id };
}
```

Append the lifecycle functions:

```ts
/** Leave the active group. Last member deletes the group; sole admin must promote first. */
export async function leaveGroupForUser(userId: string): Promise<string | null> {
  return db.transaction(async (tx) => {
    const membership = await membershipOf(tx, userId);
    if (!membership) return "You are not in a group";

    const members = await tx
      .select({ userId: groupMembers.userId, role: groupMembers.role })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, membership.groupId));

    if (members.length === 1) {
      // Cascades memberships, ingredients, sessions, suggestions, votes.
      await tx.delete(groups).where(eq(groups.id, membership.groupId));
      return null;
    }

    const otherAdmins = members.filter((m) => m.userId !== userId && m.role === "admin");
    if (membership.role === "admin" && otherAdmins.length === 0) {
      return "Promote another member to admin before leaving";
    }
    await tx.delete(groupMembers).where(eq(groupMembers.id, membership.id));
    return null;
  });
}

/** Admin-only: remove another member from the admin's group. */
export async function removeMemberFromGroup(
  adminUserId: string,
  targetUserId: string,
): Promise<string | null> {
  if (adminUserId === targetUserId) return "Use leave group instead";
  return db.transaction(async (tx) => {
    const admin = await membershipOf(tx, adminUserId);
    if (!admin || admin.role !== "admin") return "Only an admin can remove members";
    const deleted = await tx
      .delete(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, admin.groupId),
          eq(groupMembers.userId, targetUserId),
        ),
      )
      .returning({ id: groupMembers.id });
    return deleted.length === 0 ? "Member not found" : null;
  });
}

/** Admin-only: promote a member of the admin's group to admin. */
export async function promoteMemberToAdmin(
  adminUserId: string,
  targetUserId: string,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const admin = await membershipOf(tx, adminUserId);
    if (!admin || admin.role !== "admin") return "Only an admin can promote members";
    const updated = await tx
      .update(groupMembers)
      .set({ role: "admin" })
      .where(
        and(
          eq(groupMembers.groupId, admin.groupId),
          eq(groupMembers.userId, targetUserId),
        ),
      )
      .returning({ id: groupMembers.id });
    return updated.length === 0 ? "Member not found" : null;
  });
}

/** Admin-only: regenerate the group's invite code. */
export async function rotateGroupInviteCode(
  adminUserId: string,
): Promise<{ code?: string; error?: string }> {
  const admin = await membershipOf(db, adminUserId);
  if (!admin || admin.role !== "admin") {
    return { error: "Only an admin can rotate the invite code" };
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = inviteCode();
    try {
      await db
        .update(groups)
        .set({ inviteCode: code, updatedAt: new Date() })
        .where(eq(groups.id, admin.groupId));
      return { code };
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 4) continue;
      throw error;
    }
  }
  return { error: "Could not generate a unique invite code" };
}
```

- [ ] **Step 4: Update `src/app/onboarding/actions.ts`** for the new signatures + join rate limit:

```ts
"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { createGroupForUser, joinGroupForUser } from "@/lib/groups";
import { rateLimit } from "@/lib/rate-limit";

export type OnboardingState = { error?: string };

export async function createGroup(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Group name is required" };

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  let result;
  try {
    result = await createGroupForUser(session.user.id, name);
  } catch {
    return { error: "Could not create group. Please try again." };
  }
  if (result.error) return { error: result.error };
  redirect("/dashboard");
}

export async function joinGroup(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Invite code is required" };

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Blunts invite-code brute forcing.
  if (!rateLimit(`join:${session.user.id}`, 10, 60_000)) {
    return { error: "Too many attempts. Try again in a minute." };
  }

  let result;
  try {
    result = await joinGroupForUser(session.user.id, code);
  } catch {
    return { error: "Could not join group. Please try again." };
  }
  if (result.error) return { error: result.error };
  redirect("/dashboard");
}
```

- [ ] **Step 5: Verify** — `npm run typecheck && npm test` → PASS (form component tests mock these actions, so only signatures matter).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: group lifecycle (leave/remove/promote/rotate) with membership guards"
```

---

### Task 13: Settings UI for lifecycle + invite links + onboarding prefill

**Files:**
- Create: `src/app/(protected)/settings/actions.ts`
- Modify: `src/app/(protected)/settings/page.tsx`
- Modify: `src/components/settings/settings-view.tsx`
- Modify: `src/components/settings/settings-view.test.tsx`
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/components/onboarding/join-group-form.tsx`

- [ ] **Step 1: Create `src/app/(protected)/settings/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  leaveGroupForUser,
  promoteMemberToAdmin,
  removeMemberFromGroup,
  rotateGroupInviteCode,
} from "@/lib/groups";

export type SettingsActionState = { error?: string };

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

export async function leaveGroup(): Promise<SettingsActionState> {
  const userId = await requireUserId();
  const error = await leaveGroupForUser(userId);
  if (error) return { error };
  redirect("/onboarding");
}

export async function removeMember(targetUserId: string): Promise<SettingsActionState> {
  const userId = await requireUserId();
  const error = await removeMemberFromGroup(userId, targetUserId);
  if (error) return { error };
  revalidatePath("/settings");
  return {};
}

export async function promoteMember(targetUserId: string): Promise<SettingsActionState> {
  const userId = await requireUserId();
  const error = await promoteMemberToAdmin(userId, targetUserId);
  if (error) return { error };
  revalidatePath("/settings");
  return {};
}

export async function rotateInviteCode(): Promise<SettingsActionState> {
  const userId = await requireUserId();
  const result = await rotateGroupInviteCode(userId);
  if (result.error) return { error: result.error };
  revalidatePath("/settings");
  return {};
}
```

- [ ] **Step 2: Pass the invite link from `src/app/(protected)/settings/page.tsx`**

```tsx
import { env } from "@/env";
```

```tsx
  const inviteLink = `${env.NEXT_PUBLIC_APP_URL}/onboarding?code=${settings.inviteCode}`;
  return <SettingsView settings={settings} inviteLink={inviteLink} />;
```

- [ ] **Step 3: Extend `src/components/settings/settings-view.tsx`**

Add imports:

```tsx
import { useTransition } from "react";

import {
  leaveGroup,
  promoteMember,
  removeMember,
  rotateInviteCode,
} from "@/app/(protected)/settings/actions";
```

Change the signature:

```tsx
export function SettingsView({
  settings,
  inviteLink,
}: {
  settings: GroupSettings;
  inviteLink: string;
}) {
  const [pending, start] = useTransition();
  const isAdmin = settings.role === "admin";

  function run(action: () => Promise<{ error?: string }>, success?: string) {
    start(async () => {
      const res = await action();
      if (res?.error) toast.error(res.error);
      else if (success) toast.success(success);
    });
  }
```

Replace the invite-code card with a code + link + rotate + WhatsApp card:

```tsx
      <GlassCard className="space-y-2">
        <Kicker>Invite code</Kicker>
        <div className="flex items-center justify-between gap-3">
          <code className="font-mono text-lg font-bold tracking-wider">{settings.inviteCode}</code>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard?.writeText(inviteLink);
                toast.success("Invite link copied");
              }}
            >
              Copy link
            </Button>
            {isAdmin ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(rotateInviteCode, "Invite code rotated")}
              >
                Rotate
              </Button>
            ) : null}
          </div>
        </div>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(
            `Join our flat on Aaj Kya Banega? ${inviteLink}`,
          )}`}
          target="_blank"
          rel="noreferrer"
          className="text-primary text-sm font-semibold underline underline-offset-2"
        >
          Share on WhatsApp
        </a>
        <p className="text-muted-foreground text-xs">Share this so flatmates can join.</p>
      </GlassCard>
```

In the members list, replace the role chip line with admin controls:

```tsx
              <span className="flex items-center gap-2">
                {isAdmin && !m.isYou && m.role === "member" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => promoteMember(m.id), "Promoted to admin")}
                  >
                    Make admin
                  </Button>
                ) : null}
                {isAdmin && !m.isYou ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Remove ${m.name ?? "this member"} from the group?`)) {
                        run(() => removeMember(m.id), "Member removed");
                      }
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
                <Kicker variant={m.role === "admin" ? "solid" : "plain"}>{m.role}</Kicker>
              </span>
```

Before the logout button block, add leave-group:

```tsx
      <GlassCard className="space-y-2">
        <Kicker>Danger zone</Kicker>
        <Button
          variant="outline"
          disabled={pending}
          className="w-full"
          onClick={() => {
            if (window.confirm("Leave this group? You'll need an invite to rejoin.")) {
              run(leaveGroup);
            }
          }}
        >
          Leave group
        </Button>
      </GlassCard>
```

- [ ] **Step 4: Update `src/components/settings/settings-view.test.tsx`**

Add the actions mock next to the existing mocks:

```ts
vi.mock("@/app/(protected)/settings/actions", () => ({
  leaveGroup: vi.fn().mockResolvedValue({}),
  promoteMember: vi.fn().mockResolvedValue({}),
  removeMember: vi.fn().mockResolvedValue({}),
  rotateInviteCode: vi.fn().mockResolvedValue({}),
}));
```

Update renders to pass `inviteLink="http://localhost:3000/onboarding?code=ABC123"`, and add tests:

```ts
test("admin sees member management and rotate controls", () => {
  render(<SettingsView settings={settings} inviteLink="http://x/onboarding?code=ABC123" />);
  expect(screen.getByRole("button", { name: /make admin/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /rotate/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /leave group/i })).toBeInTheDocument();
});

test("member does not see admin controls", () => {
  const memberSettings = { ...settings, role: "member" as const };
  render(<SettingsView settings={memberSettings} inviteLink="http://x" />);
  expect(screen.queryByRole("button", { name: /make admin/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /rotate/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 5: Prefill the join form from the invite link** — `src/app/onboarding/page.tsx` (searchParams is a Promise in Next 16):

```tsx
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { code } = await searchParams;
  const defaultCode = typeof code === "string" ? code : undefined;
```

and pass `<JoinGroupForm defaultCode={defaultCode} />`. In `join-group-form.tsx`:

```tsx
export function JoinGroupForm({ defaultCode }: { defaultCode?: string }) {
```

and on the input: `defaultValue={defaultCode}`.

- [ ] **Step 6: Verify** — `npm run typecheck && npm test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: settings lifecycle controls, invite links, onboarding prefill"
```

---

### Task 14: Resilience UI — error boundary, loading skeleton, generate skeleton

**Files:**
- Create: `src/app/(protected)/error.tsx`
- Create: `src/app/(protected)/dashboard/loading.tsx`
- Modify: `src/components/dashboard/dashboard-view.tsx`

- [ ] **Step 1: Create `src/app/(protected)/error.tsx`** (this Next version passes `unstable_retry`):

```tsx
"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";

export default function ProtectedError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <GlassCard className="space-y-3 text-center">
      <div className="text-lg font-extrabold">Something went wrong</div>
      <p className="text-muted-foreground text-sm">
        Couldn&apos;t load this screen. Check your connection and try again.
      </p>
      <Button onClick={() => unstable_retry()}>Try again</Button>
    </GlassCard>
  );
}
```

- [ ] **Step 2: Create `src/app/(protected)/dashboard/loading.tsx`**

```tsx
import { GlassCard } from "@/components/ui/glass-card";

export default function DashboardLoading() {
  return (
    <section className="space-y-4" aria-busy="true">
      <div className="bg-card h-8 w-28 animate-pulse rounded-lg" />
      <div className="flex gap-2">
        <div className="bg-card h-10 flex-1 animate-pulse rounded-xl border" />
        <div className="bg-card h-10 flex-1 animate-pulse rounded-xl border" />
      </div>
      {[0, 1, 2].map((i) => (
        <GlassCard key={i} className="h-16 animate-pulse" />
      ))}
    </section>
  );
}
```

- [ ] **Step 3: Generate skeleton in `dashboard-view.tsx`** — in `SessionPanel`, add state and wire it:

```tsx
  const [generating, setGenerating] = useState(false);
```

```tsx
  function runGenerate() {
    setGenerating(true);
    start(async () => {
      const res = await generateSuggestions(session.id);
      if (res.error) toast.error(res.error);
      setGenerating(false);
    });
  }
```

Replace the empty-state/list conditional's opening with:

```tsx
      {generating ? (
        <ul className="space-y-2" aria-label="Generating suggestions">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i}>
              <GlassCard className="h-14 animate-pulse" />
            </li>
          ))}
        </ul>
      ) : suggestions.length === 0 ? (
```

(the rest of the conditional chain is unchanged).

- [ ] **Step 4: Verify** — `npm run typecheck && npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: error boundary, dashboard loading state, generate skeleton"
```

---

### Task 15: Cleanup — stale Supabase artifacts, dead route, stale spec

**Files:**
- Delete: `supabase/migrations/20260605000000_init.sql`, `supabase/migrations/20260605000001_group_rpcs.sql`
- Delete: `src/app/(protected)/voting/page.tsx`
- Modify: `src/auth.config.ts`
- Modify: `src/lib/sessions.ts`
- Modify: `FlatMateMealPlanner.md`

- [ ] **Step 1: Delete stale artifacts**

```bash
git rm -r supabase
git rm "src/app/(protected)/voting/page.tsx"
```

- [ ] **Step 2: Remove `/voting` from `PROTECTED_PREFIXES`** in `src/auth.config.ts` (delete the `"/voting",` line).

- [ ] **Step 3: Drop the unused `at` field** — in `src/lib/sessions.ts` `getRecentMealNames`, change the select to `{ name: finalizedMeals.mealName }` (keep the `orderBy`).

- [ ] **Step 4: Fix `FlatMateMealPlanner.md`**

Replace the entire `# Tech Stack` section (from `# Tech Stack` up to but excluding `# Core Features`) with:

```markdown
# Tech Stack

## Frontend

* Next.js 16 (App Router)
* TypeScript
* Tailwind CSS v4
* shadcn-style components (Base UI + cva)

## Backend

* Next.js Server Actions

## Database

* Neon Postgres (serverless) via Drizzle ORM
* Schema source of truth: `src/db/schema.ts`; migrations in `drizzle/`

## Authentication

* Auth.js v5 (Credentials provider, JWT sessions)
* Authorization is enforced in server actions (group-scoped queries), not RLS

## AI

* Gemini API (`gemini-2.5-flash`, structured JSON output)

## Deployment

* Vercel

---
```

Replace everything from `# Database Schema` up to but excluding `# Application Pages` with:

```markdown
# Database Schema

The schema lives in [`src/db/schema.ts`](src/db/schema.ts) (Drizzle) — that file is
the source of truth; migrations are generated into `drizzle/`. Design decisions:

* **Two meal sessions per group per day: Lunch and Dinner.** Enforced by
  `unique (group_id, session_date, meal_type)`. Session dates are computed in the
  group's timezone.
* **Availability is presence-based, not quantity-based, in v1.** Quantities are
  stored for display and grocery lists but don't block a meal.
* **Voting ends when an admin finalizes.** Tie-break: earliest-suggested meal wins.
* **One vote per user per session** (`unique (session_id, user_id)`, upsert to move).
* **Meal history is derived from finalized meals** — single source of truth.
* **Regeneration is locked once voting starts** and rate-limited per session.

---
```

- [ ] **Step 5: Verify** — `npm run typecheck && npm test && npm run lint` → PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove stale Supabase artifacts and dead voting route, fix spec drift"
```

---

### Task 16: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

env:
  # Dummy values — env validation needs presence; nothing connects in CI.
  DATABASE_URL: postgres://ci:ci@localhost:5432/ci
  AUTH_SECRET: ci-only-secret
  NEXT_PUBLIC_APP_URL: http://localhost:3000

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Verify locally that the same commands pass**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all PASS (build uses `.env.local`).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "ci: lint, typecheck, test, build on push and PR"
```

---

### Task 17: PWA manifest + icon

**Files:**
- Create: `src/app/manifest.ts`
- Create: `public/icon.svg`

- [ ] **Step 1: Create `public/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#C98A2E"/>
  <text x="256" y="340" font-size="280" text-anchor="middle">🍛</text>
</svg>
```

- [ ] **Step 2: Create `src/app/manifest.ts`** (colors match `globals.css` light theme)

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aaj Kya Banega?",
    short_name: "Aaj Kya Banega",
    description:
      "Decide what to cook in under 2 minutes — vote, get AI meal suggestions, and avoid repeats.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#FBF1DC",
    theme_color: "#C98A2E",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
```

- [ ] **Step 3: Verify** — `npm run build` → succeeds; the build output lists `/manifest.webmanifest`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: PWA manifest and app icon for installability"
```

---

## Final verification

- [ ] Run the full suite: `npm run lint && npm run typecheck && npm test && npm run build` — all PASS.
- [ ] `git log --oneline main..improvements` shows one commit per task.
- [ ] Manual smoke (optional, needs `.env.local`): `npm run dev` → register → create group → add ingredients → generate → vote → finalize → check history, settings controls, and that a second browser session sees votes appear within ~8s.
