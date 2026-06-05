# Voting & Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let group members tap-to-vote on the AI suggestions (one changeable vote per session), see live tallies and "X of N voted", and let an admin finalize the winning meal — which shows a grocery list of missing ingredients. Add a toast system for feedback.

**Architecture:** Voting/finalization live on the dashboard, integrated into the existing Lunch/Dinner suggestion panels (suggestions are the vote targets). Pure `pickWinner` (votes desc, earliest suggestion wins ties) is TDD'd. Drizzle functions are group-authorized; `castVote` upserts on the `(session_id, user_id)` unique index; `finalizeSession` is admin-only and transactional. A `sonner` Toaster provides feedback. `generateSuggestions` gains a status guard so regenerating can't wipe votes.

**Tech Stack:** Next.js 16 Server Actions, Drizzle/Neon, sonner, Vitest.

Plan 5 of the build. Depends on Plan 4 (sessions + suggestions, merged). Tables `votes` (unique `(session_id, user_id)`) and `finalized_meals` (unique `session_id`) already exist.

**Scope notes:**
- One vote per user per session, changeable while the session is `open`/`voting`; locked once `finalized`.
- Finalize = admin only; winner = most votes, ties broken by earliest-created suggestion.
- Voter **avatars** are deferred (we show counts + your-vote + "X of N voted"); WhatsApp share deferred (grocery list has Copy).

---

## File Structure

**Created:**
- `src/lib/votes.ts` (+`.test.ts` for `pickWinner`) — `pickWinner`, `getSessionVoteState`, `castVoteForUser`, `finalizeSessionForGroup`, `getFinalizedMeal`
- `src/app/(protected)/dashboard/vote-actions.ts` — `castVote`, `finalizeSession`
- `src/components/ui/toast.tsx` — `<AppToaster />` (sonner wrapper, themed)

**Modified:**
- `package.json` — add `sonner`
- `src/lib/groups.ts` — add `getGroupContext(userId)` → `{ id, name, role, memberCount }`
- `src/app/layout.tsx` — mount `<AppToaster />`
- `src/app/(protected)/dashboard/actions.ts` — guard `generateSuggestions` by `session.status === "open"`
- `src/app/(protected)/dashboard/page.tsx` — fetch vote state + group context + finalized meal per session
- `src/components/dashboard/dashboard-view.tsx` — voting UI (tap-to-vote, tallies, finalize, finalized/grocery), toasts
- `src/app/(protected)/voting/page.tsx` — redirect to `/dashboard` (voting lives on the dashboard)

---

## Task 1: pickWinner (pure) + vote/group queries

- [ ] Failing test `src/lib/votes.test.ts`:
```ts
import { expect, test } from "vitest";

import { pickWinner } from "./votes";

const row = (id: string, votes: number, order: number) => ({
  id,
  votes,
  createdAt: new Date(2026, 0, 1, 0, order),
});

test("returns the most-voted suggestion", () => {
  expect(pickWinner([row("a", 1, 0), row("b", 3, 1), row("c", 2, 2)])).toBe("b");
});

test("breaks ties by earliest created", () => {
  expect(pickWinner([row("a", 2, 1), row("b", 2, 0)])).toBe("b");
});

test("returns null when there are no votes at all", () => {
  expect(pickWinner([row("a", 0, 0), row("b", 0, 1)])).toBeNull();
});

test("returns null for an empty list", () => {
  expect(pickWinner([])).toBeNull();
});
```

- [ ] Run `npm test -- votes` (FAIL). Implement `src/lib/votes.ts`:
```ts
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  finalizedMeals,
  groupMembers,
  mealSessions,
  mealSuggestions,
  votes,
} from "@/db/schema";

export interface WinnerRow {
  id: string;
  votes: number;
  createdAt: Date;
}

/** Winner = most votes, ties broken by earliest createdAt. Null if no votes. */
export function pickWinner(rows: WinnerRow[]): string | null {
  let best: WinnerRow | null = null;
  for (const r of rows) {
    if (r.votes <= 0) continue;
    if (
      !best ||
      r.votes > best.votes ||
      (r.votes === best.votes && r.createdAt < best.createdAt)
    ) {
      best = r;
    }
  }
  return best?.id ?? null;
}

export interface SuggestionVote {
  id: string;
  mealName: string;
  requiredIngredients: string[];
  votes: number;
  mine: boolean;
}

export interface SessionVoteState {
  suggestions: SuggestionVote[];
  totalVoters: number;
}

/** Per-suggestion vote counts + whether the given user voted for each. */
export async function getSessionVoteState(
  sessionId: string,
  userId: string,
): Promise<SessionVoteState> {
  const suggestions = await db
    .select()
    .from(mealSuggestions)
    .where(eq(mealSuggestions.sessionId, sessionId))
    .orderBy(mealSuggestions.createdAt);

  const voteRows = await db
    .select({ suggestionId: votes.suggestionId, userId: votes.userId })
    .from(votes)
    .where(eq(votes.sessionId, sessionId));

  const counts = new Map<string, number>();
  let myVote: string | null = null;
  for (const v of voteRows) {
    counts.set(v.suggestionId, (counts.get(v.suggestionId) ?? 0) + 1);
    if (v.userId === userId) myVote = v.suggestionId;
  }

  return {
    suggestions: suggestions.map((s) => ({
      id: s.id,
      mealName: s.mealName,
      requiredIngredients: s.requiredIngredients,
      votes: counts.get(s.id) ?? 0,
      mine: myVote === s.id,
    })),
    totalVoters: voteRows.length,
  };
}

async function sessionInGroup(sessionId: string, groupId: string) {
  const [s] = await db
    .select()
    .from(mealSessions)
    .where(and(eq(mealSessions.id, sessionId), eq(mealSessions.groupId, groupId)))
    .limit(1);
  return s ?? null;
}

/** Cast or move the user's single vote for a session. Returns an error string or null. */
export async function castVoteForUser(
  userId: string,
  groupId: string,
  sessionId: string,
  suggestionId: string,
): Promise<string | null> {
  const session = await sessionInGroup(sessionId, groupId);
  if (!session) return "Session not found";
  if (session.status === "finalized") return "Voting is closed";

  // suggestion must belong to this session
  const [sug] = await db
    .select({ id: mealSuggestions.id })
    .from(mealSuggestions)
    .where(
      and(eq(mealSuggestions.id, suggestionId), eq(mealSuggestions.sessionId, sessionId)),
    )
    .limit(1);
  if (!sug) return "Invalid choice";

  await db
    .insert(votes)
    .values({ sessionId, suggestionId, userId })
    .onConflictDoUpdate({
      target: [votes.sessionId, votes.userId],
      set: { suggestionId },
    });
  return null;
}

/** Admin-only finalize: pick the winner and lock the session. Returns error or null. */
export async function finalizeSessionForGroup(
  userId: string,
  groupId: string,
  isAdmin: boolean,
  sessionId: string,
): Promise<string | null> {
  if (!isAdmin) return "Only an admin can finalize";
  const session = await sessionInGroup(sessionId, groupId);
  if (!session) return "Session not found";
  if (session.status === "finalized") return "Already finalized";

  const rows = await db
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

  await db.transaction(async (tx) => {
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
  });
  return null;
}

export async function getFinalizedMeal(
  sessionId: string,
): Promise<{ mealName: string } | null> {
  const [row] = await db
    .select({ mealName: finalizedMeals.mealName })
    .from(finalizedMeals)
    .where(eq(finalizedMeals.sessionId, sessionId))
    .limit(1);
  return row ?? null;
}
```

- [ ] Run `npm test -- votes` (PASS 4). `npx tsc --noEmit` → exit 0. Commit:
```bash
git add src/lib/votes.ts src/lib/votes.test.ts
git commit -m "feat: add voting/finalization data layer"
```

---

## Task 2: getGroupContext

- [ ] Add to `src/lib/groups.ts`:
```ts
export interface GroupContext {
  id: string;
  name: string;
  role: "admin" | "member";
  memberCount: number;
}

/** The user's active group with their role and the member count. */
export async function getGroupContext(userId: string): Promise<GroupContext | null> {
  const [membership] = await db
    .select({
      id: groups.id,
      name: groups.name,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .where(eq(groupMembers.userId, userId))
    .orderBy(asc(groupMembers.joinedAt))
    .limit(1);
  if (!membership) return null;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, membership.id));

  return { ...membership, memberCount: count };
}
```
Add `sql` to the drizzle-orm import in groups.ts if not present (`import { and, asc, eq, sql } from "drizzle-orm"` — drop `and` if unused).

- [ ] `npx tsc --noEmit` → exit 0. Commit:
```bash
git add src/lib/groups.ts
git commit -m "feat: add getGroupContext (role + member count)"
```

---

## Task 3: Toast system + generate status guard

- [ ] Install: `npm install sonner`

- [ ] Create `src/components/ui/toast.tsx`:
```tsx
"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return <Toaster position="top-center" richColors closeButton />;
}
```

- [ ] Mount it in `src/app/layout.tsx`: import `AppToaster` and render `<AppToaster />` just inside `<body>` (after `{children}` is fine), e.g.:
```tsx
        <ThemeProvider ...>
          {children}
        </ThemeProvider>
        <AppToaster />
```

- [ ] Guard `generateSuggestions` in `src/app/(protected)/dashboard/actions.ts`: after fetching `mealSession`, add before the AI call:
```ts
  if (mealSession.status !== "open") {
    return { error: "Voting has started — regenerate is locked." };
  }
```

- [ ] `npx tsc --noEmit` (exit 0), `npm test` (pass), `npm run build` (compiles). Commit:
```bash
git add src/components/ui/toast.tsx src/app/layout.tsx "src/app/(protected)/dashboard/actions.ts"
git commit -m "feat: add toast system and lock regenerate after voting"
```

---

## Task 4: Vote + finalize actions

- [ ] Create `src/app/(protected)/dashboard/vote-actions.ts`:
```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getGroupContext } from "@/lib/groups";
import { castVoteForUser, finalizeSessionForGroup } from "@/lib/votes";

export type VoteState = { error?: string };

export async function castVote(
  sessionId: string,
  suggestionId: string,
): Promise<VoteState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const group = await getGroupContext(session.user.id);
  if (!group) redirect("/onboarding");

  const error = await castVoteForUser(session.user.id, group.id, sessionId, suggestionId);
  if (error) return { error };
  revalidatePath("/dashboard");
  return {};
}

export async function finalizeSession(sessionId: string): Promise<VoteState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const group = await getGroupContext(session.user.id);
  if (!group) redirect("/onboarding");

  const error = await finalizeSessionForGroup(
    session.user.id,
    group.id,
    group.role === "admin",
    sessionId,
  );
  if (error) return { error };
  revalidatePath("/dashboard");
  return {};
}
```

- [ ] `npx tsc --noEmit` → exit 0. Commit:
```bash
git add "src/app/(protected)/dashboard/vote-actions.ts"
git commit -m "feat: add castVote and finalizeSession actions"
```

---

## Task 5: Dashboard voting UI

- [ ] Replace `src/components/dashboard/dashboard-view.tsx` with the voting-integrated version:
```tsx
"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { generateSuggestions } from "@/app/(protected)/dashboard/actions";
import { castVote, finalizeSession } from "@/app/(protected)/dashboard/vote-actions";
import { Button } from "@/components/ui/button";
import { CountChip } from "@/components/ui/count-chip";
import { GlassCard } from "@/components/ui/glass-card";
import { Kicker } from "@/components/ui/kicker";
import { missingIngredients } from "@/lib/sessions";
import type { SuggestionVote } from "@/lib/votes";
import type { MealSession } from "@/db/schema";
import { cn } from "@/lib/utils";

export interface SessionBundle {
  session: MealSession;
  suggestions: SuggestionVote[];
  totalVoters: number;
  finalized: { mealName: string } | null;
}

export function DashboardView({
  available,
  isAdmin,
  memberCount,
  lunch,
  dinner,
}: {
  available: string[];
  isAdmin: boolean;
  memberCount: number;
  lunch: SessionBundle;
  dinner: SessionBundle;
}) {
  const [tab, setTab] = useState<"lunch" | "dinner">("lunch");
  const active = tab === "lunch" ? lunch : dinner;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-extrabold">Today</h1>
      <div role="tablist" className="flex gap-2">
        {(["lunch", "dinner"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-xl border py-2 text-sm font-bold capitalize",
              tab === t ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <SessionPanel
        key={active.session.id}
        bundle={active}
        available={available}
        isAdmin={isAdmin}
        memberCount={memberCount}
      />
    </section>
  );
}

function SessionPanel({
  bundle,
  available,
  isAdmin,
  memberCount,
}: {
  bundle: SessionBundle;
  available: string[];
  isAdmin: boolean;
  memberCount: number;
}) {
  const [pending, start] = useTransition();
  const { session, suggestions, totalVoters, finalized } = bundle;

  if (session.status === "finalized" && finalized) {
    const chosen = suggestions.find((s) => s.mealName === finalized.mealName);
    const missing = chosen ? missingIngredients(chosen.requiredIngredients, available) : [];
    return (
      <GlassCard className="space-y-2">
        <Kicker variant="solid">Finalized</Kicker>
        <div className="text-xl font-extrabold">🍽️ {finalized.mealName}</div>
        {missing.length > 0 ? (
          <div className="space-y-1">
            <div className="text-sm font-semibold">Shopping list:</div>
            <div className="text-destructive text-sm">{missing.join(", ")}</div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard?.writeText(missing.join(", "));
                toast.success("Grocery list copied");
              }}
            >
              Copy list
            </Button>
          </div>
        ) : (
          <div className="text-sm text-emerald-600">You have everything. 🎉</div>
        )}
      </GlassCard>
    );
  }

  function runVote(suggestionId: string) {
    start(async () => {
      const res = await castVote(session.id, suggestionId);
      if (res.error) toast.error(res.error);
    });
  }

  function runGenerate() {
    start(async () => {
      const res = await generateSuggestions(session.id);
      if (res.error) toast.error(res.error);
    });
  }

  function runFinalize() {
    start(async () => {
      const res = await finalizeSession(session.id);
      if (res.error) toast.error(res.error);
      else toast.success("Meal finalized!");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Kicker>
          {totalVoters} of {memberCount} voted
        </Kicker>
        <Button size="sm" variant="outline" disabled={pending} onClick={runGenerate}>
          <Sparkles className="size-4" />
          {suggestions.length ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {suggestions.length === 0 ? (
        <GlassCard className="text-muted-foreground text-sm">
          No suggestions yet. Tap Generate to get AI ideas from your pantry.
        </GlassCard>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((s) => {
            const missing = missingIngredients(s.requiredIngredients, available);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => runVote(s.id)}
                  aria-pressed={s.mine}
                  className="w-full text-left"
                >
                  <GlassCard
                    className={cn(
                      "flex items-center gap-3",
                      s.mine && "ring-2 ring-primary",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{s.mealName}</div>
                      {missing.length > 0 ? (
                        <div className="text-destructive text-xs font-semibold">
                          ⚠ needs {missing.join(", ")}
                        </div>
                      ) : (
                        <div className="text-xs font-semibold text-emerald-600">
                          ✓ you have everything
                        </div>
                      )}
                    </div>
                    <CountChip count={s.votes} />
                  </GlassCard>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {isAdmin && suggestions.length > 0 ? (
        <Button className="w-full" disabled={pending || totalVoters === 0} onClick={runFinalize}>
          Finalize {totalVoters === 0 ? "(no votes yet)" : "winning meal"}
        </Button>
      ) : null}
    </div>
  );
}
```

- [ ] Update the test `src/components/dashboard/dashboard-view.test.tsx` to the new props shape. Replace it with:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

vi.mock("@/app/(protected)/dashboard/actions", () => ({ generateSuggestions: vi.fn() }));
vi.mock("@/app/(protected)/dashboard/vote-actions", () => ({
  castVote: vi.fn().mockResolvedValue({}),
  finalizeSession: vi.fn().mockResolvedValue({}),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { castVote } from "@/app/(protected)/dashboard/vote-actions";
import { DashboardView } from "./dashboard-view";

const sv = (id: string, name: string, req: string[], votes: number, mine = false) => ({
  id, mealName: name, requiredIngredients: req, votes, mine,
});
const sessBase = { groupId: "g", sessionDate: "2026-06-05", status: "open" as const, createdAt: new Date() };
const lunch = {
  session: { id: "l", mealType: "lunch" as const, ...sessBase },
  suggestions: [sv("1", "Egg Fried Rice", ["egg", "rice"], 2, true), sv("2", "Paneer Masala", ["paneer"], 0)],
  totalVoters: 2,
  finalized: null,
};
const dinner = {
  session: { id: "d", mealType: "dinner" as const, ...sessBase },
  suggestions: [],
  totalVoters: 0,
  finalized: null,
};

const props = { available: ["rice", "egg"], isAdmin: true, memberCount: 3, lunch, dinner };

test("shows suggestions, votes count, and progress", () => {
  render(<DashboardView {...props} />);
  expect(screen.getByText("Egg Fried Rice")).toBeInTheDocument();
  expect(screen.getByText(/2 of 3 voted/i)).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument(); // vote count chip
});

test("tapping a suggestion casts a vote", async () => {
  render(<DashboardView {...props} />);
  await userEvent.click(screen.getByText("Paneer Masala"));
  expect(castVote).toHaveBeenCalledWith("l", "2");
});

test("admin sees a finalize button", () => {
  render(<DashboardView {...props} />);
  expect(screen.getByRole("button", { name: /finalize/i })).toBeInTheDocument();
});

test("finalized session shows the chosen meal and grocery list", () => {
  const finalizedProps = {
    ...props,
    lunch: {
      ...lunch,
      session: { ...lunch.session, status: "finalized" as const },
      finalized: { mealName: "Paneer Masala" },
    },
  };
  render(<DashboardView {...finalizedProps} />);
  expect(screen.getByText(/Paneer Masala/)).toBeInTheDocument();
  expect(screen.getByText(/paneer/i)).toBeInTheDocument(); // missing ingredient in grocery list
});
```

- [ ] Run `npm test -- dashboard-view` (PASS 4). Commit:
```bash
git add src/components/dashboard/dashboard-view.tsx src/components/dashboard/dashboard-view.test.tsx
git commit -m "feat: voting UI on the dashboard (tap-to-vote, finalize, grocery)"
```

---

## Task 6: Wire dashboard page + redirect /voting

- [ ] Replace `src/app/(protected)/dashboard/page.tsx`:
```tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DashboardView, type SessionBundle } from "@/components/dashboard/dashboard-view";
import { getGroupContext } from "@/lib/groups";
import { getAvailableIngredientNames, getOrCreateTodaySessions } from "@/lib/sessions";
import { getFinalizedMeal, getSessionVoteState } from "@/lib/votes";
import type { MealSession } from "@/db/schema";

async function bundle(session: MealSession, userId: string): Promise<SessionBundle> {
  const [state, finalized] = await Promise.all([
    getSessionVoteState(session.id, userId),
    getFinalizedMeal(session.id),
  ]);
  return {
    session,
    suggestions: state.suggestions,
    totalVoters: state.totalVoters,
    finalized,
  };
}

export default async function DashboardPage() {
  const auth_ = await auth();
  if (!auth_?.user?.id) redirect("/login");
  const userId = auth_.user.id;

  const group = await getGroupContext(userId);
  if (!group) redirect("/onboarding");

  const { lunch, dinner } = await getOrCreateTodaySessions(group.id);
  const [lunchBundle, dinnerBundle, available] = await Promise.all([
    bundle(lunch, userId),
    bundle(dinner, userId),
    getAvailableIngredientNames(group.id),
  ]);

  return (
    <DashboardView
      available={available}
      isAdmin={group.role === "admin"}
      memberCount={group.memberCount}
      lunch={lunchBundle}
      dinner={dinnerBundle}
    />
  );
}
```

- [ ] Replace `src/app/(protected)/voting/page.tsx` (voting lives on the dashboard):
```tsx
import { redirect } from "next/navigation";

export default function VotingPage() {
  redirect("/dashboard");
}
```

- [ ] `npx tsc --noEmit` (exit 0), `npm run lint` (clean), `npm test` (all pass), `npm run build` ("Compiled successfully"). Commit:
```bash
git add "src/app/(protected)/dashboard/page.tsx" "src/app/(protected)/voting/page.tsx"
git commit -m "feat: wire dashboard voting + redirect /voting to dashboard"
```

---

## Task 7: Headless end-to-end (against Neon)

- [ ] Create throwaway `scripts/verify-e.mjs` (run with `node --env-file=.env.local`): create a group with an admin + 2 members, a session, 3 suggestions; cast votes (incl. one user changing their vote — assert the unique constraint keeps one row per user); compute the tally; pick the winner (most votes, earliest tie-break); insert finalized_meals + flip status; assert a second finalize is rejected by the `session_id` unique constraint; clean up. Expect all ✓.
- [ ] Run it → all ✓. Delete the script; do not commit.

---

## Self-Review
- **Coverage:** tap-to-vote (one changeable vote/session via upsert), live tallies + "X of N voted", admin finalize (winner = votes desc, earliest tie-break), finalized display + grocery list (copy), regenerate locked after voting, toasts. ✓
- **Security:** `castVote`/`finalizeSession` derive group+role from session; session re-authorized against the group; finalize is admin-gated; suggestion must belong to the session. ✓
- **Data integrity:** vote upsert on `(session_id,user_id)`; finalize transactional; `finalized_meals.session_id` unique prevents double-finalize. ✓
- **Boundaries:** voter avatars + WhatsApp share deferred; `/voting` redirects to the dashboard. ✓
- **Type consistency:** `SuggestionVote`/`SessionVoteState` (votes lib) feed `SessionBundle` (view) and the page; `pickWinner` reused by finalize. ✓
