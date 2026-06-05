# Sessions & AI Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Auto-create the day's Lunch & Dinner sessions for the group, generate AI meal suggestions (Gemini) from the available pantry + recent meals, and show them on the dashboard with missing-ingredient flags.

**Architecture:** Pure, TDD'd helpers do prompt-building, JSON parsing, missing-ingredient set-difference, and date formatting. `generateMealSuggestions` calls the Gemini REST API (structured JSON output) — no SDK dependency. Sessions/queries are Drizzle, scoped to the session-derived group. The dashboard server component get-or-creates today's two sessions and renders a client tab view; a `generateSuggestions` action (group-authorized) regenerates suggestions for a session.

**Tech Stack:** Next.js 16 Server Actions, Drizzle/Neon, Gemini REST (`gemini-2.5-flash`, key verified), zod, Vitest.

Plan 4 of the build. Depends on the Neon/Auth.js/Drizzle re-platform (merged). Voting UI is Plan 5 — this plan shows suggestions + a generate button, not voting.

**Scope notes:**
- "Today" uses the server runtime's local date (`toDateString`). True user-local date is a deferred follow-up (needs the client TZ).
- Regenerating replaces a session's existing AI suggestions.
- 5 suggestions per generation.

---

## File Structure

**Created:**
- `src/lib/ai/prompt.ts` (+`.test.ts`) — `buildSuggestionPrompt`
- `src/lib/ai/parse.ts` (+`.test.ts`) — `parseSuggestions` + `Suggestion` type + schema
- `src/lib/ai/gemini.ts` — `generateMealSuggestions` (Gemini REST)
- `src/lib/sessions.ts` (+`.test.ts` for the pure parts) — `missingIngredients`, `toDateString` (pure); `getOrCreateTodaySessions`, `getSessionSuggestions`, `getAvailableIngredientNames`, `getRecentMealNames` (Drizzle)
- `src/app/(protected)/dashboard/actions.ts` — `generateSuggestions`
- `src/components/dashboard/dashboard-view.tsx` (+`.test.tsx`)

**Modified:**
- `src/db/schema.ts` — add `MealSession`/`MealSuggestion`/`Vote`/`FinalizedMeal` type exports
- `src/app/(protected)/dashboard/page.tsx` — wire sessions + suggestions → DashboardView

---

## Task 1: Schema type exports

- [ ] In `src/db/schema.ts`, the inferred-types block already exports `User`, `Group`, `GroupMember`, `Ingredient`. Confirm these four are also present (add any missing):
```ts
export type MealSession = typeof mealSessions.$inferSelect;
export type MealSuggestion = typeof mealSuggestions.$inferSelect;
export type Vote = typeof votes.$inferSelect;
export type FinalizedMeal = typeof finalizedMeals.$inferSelect;
```
- [ ] `npx tsc --noEmit` → exit 0. Commit:
```bash
git add src/db/schema.ts
git commit -m "chore: export meal session/suggestion/vote types"
```

---

## Task 2: AI prompt builder (pure)

- [ ] Failing test `src/lib/ai/prompt.test.ts`:
```ts
import { expect, test } from "vitest";

import { buildSuggestionPrompt } from "./prompt";

test("includes the meal type and available ingredients", () => {
  const p = buildSuggestionPrompt({
    availableIngredients: ["onion", "rice"],
    recentMeals: ["Rajma Rice"],
    mealType: "dinner",
  });
  expect(p).toMatch(/dinner/i);
  expect(p).toContain("onion");
  expect(p).toContain("rice");
  expect(p).toContain("Rajma Rice");
});

test("handles empty ingredient and recent lists", () => {
  const p = buildSuggestionPrompt({ availableIngredients: [], recentMeals: [], mealType: "lunch" });
  expect(p).toMatch(/lunch/i);
  expect(p).toMatch(/none/i);
});
```
- [ ] Run `npm test -- ai/prompt` (FAIL). Implement `src/lib/ai/prompt.ts`:
```ts
export interface SuggestionInput {
  availableIngredients: string[];
  recentMeals: string[];
  mealType: "lunch" | "dinner";
}

export function buildSuggestionPrompt(input: SuggestionInput): string {
  const available = input.availableIngredients.length
    ? input.availableIngredients.join(", ")
    : "none listed";
  const recent = input.recentMeals.length ? input.recentMeals.join(", ") : "none";

  return [
    "You are a meal-planning assistant for flatmates in India.",
    `Suggest 5 simple, budget-friendly, easy-to-cook ${input.mealType} dishes.`,
    `Available ingredients: ${available}.`,
    "Prefer dishes that mostly use the available ingredients; a few may need 1-2 extra common items.",
    `Recently eaten (do NOT repeat these): ${recent}.`,
    "For each dish list its key required ingredients as simple lowercase names.",
    "Return ONLY JSON matching the requested schema.",
  ].join("\n");
}
```
- [ ] Run `npm test -- ai/prompt` (PASS 2). Commit:
```bash
git add src/lib/ai/prompt.ts src/lib/ai/prompt.test.ts
git commit -m "feat: add AI suggestion prompt builder"
```

---

## Task 3: AI response parser (pure)

- [ ] Failing test `src/lib/ai/parse.test.ts`:
```ts
import { expect, test } from "vitest";

import { parseSuggestions } from "./parse";

test("parses valid suggestions and lowercases ingredients", () => {
  const json = JSON.stringify([
    { mealName: "Egg Fried Rice", requiredIngredients: ["Egg", "Rice"] },
  ]);
  const out = parseSuggestions(json);
  expect(out).toEqual([{ mealName: "Egg Fried Rice", requiredIngredients: ["egg", "rice"] }]);
});

test("skips invalid items and returns [] on bad JSON", () => {
  expect(parseSuggestions("not json")).toEqual([]);
  const mixed = JSON.stringify([{ mealName: "" }, { mealName: "Dal", requiredIngredients: ["dal"] }]);
  expect(parseSuggestions(mixed)).toEqual([{ mealName: "Dal", requiredIngredients: ["dal"] }]);
});

test("respects the limit", () => {
  const arr = Array.from({ length: 8 }, (_, i) => ({ mealName: `M${i}`, requiredIngredients: [] }));
  expect(parseSuggestions(JSON.stringify(arr), 5)).toHaveLength(5);
});
```
- [ ] Run `npm test -- ai/parse` (FAIL). Implement `src/lib/ai/parse.ts`:
```ts
import { z } from "zod";

const suggestionSchema = z.object({
  mealName: z.string().trim().min(1),
  requiredIngredients: z.array(z.string().trim().min(1)).default([]),
});

export interface Suggestion {
  mealName: string;
  requiredIngredients: string[];
}

export function parseSuggestions(jsonText: string, limit = 5): Suggestion[] {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const arr = Array.isArray(raw) ? raw : [];
  const out: Suggestion[] = [];
  for (const item of arr) {
    const parsed = suggestionSchema.safeParse(item);
    if (parsed.success) {
      out.push({
        mealName: parsed.data.mealName,
        requiredIngredients: parsed.data.requiredIngredients.map((s) => s.toLowerCase()),
      });
    }
    if (out.length >= limit) break;
  }
  return out;
}
```
- [ ] Run `npm test -- ai/parse` (PASS 3). Commit:
```bash
git add src/lib/ai/parse.ts src/lib/ai/parse.test.ts
git commit -m "feat: add AI suggestion parser"
```

---

## Task 4: Gemini client

- [ ] Implement `src/lib/ai/gemini.ts` (no unit test — exercised by the headless verify in Task 9):
```ts
import { buildSuggestionPrompt, type SuggestionInput } from "./prompt";
import { parseSuggestions, type Suggestion } from "./parse";

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const RESPONSE_SCHEMA = {
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

export async function generateMealSuggestions(
  input: SuggestionInput,
): Promise<Suggestion[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildSuggestionPrompt(input) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini request failed: ${res.status}`);
  }

  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
  return parseSuggestions(text);
}
```
- [ ] `npx tsc --noEmit` → exit 0. Commit:
```bash
git add src/lib/ai/gemini.ts
git commit -m "feat: add Gemini meal-suggestion client"
```

---

## Task 5: Sessions library

- [ ] Failing test `src/lib/sessions.test.ts` (pure helpers only):
```ts
import { expect, test } from "vitest";

import { missingIngredients, toDateString } from "./sessions";

test("missingIngredients is a case-insensitive set difference", () => {
  expect(missingIngredients(["Paneer", "Tomato"], ["tomato", "onion"])).toEqual(["Paneer"]);
  expect(missingIngredients(["rice"], ["Rice"])).toEqual([]);
});

test("toDateString formats local Y-M-D", () => {
  expect(toDateString(new Date(2026, 5, 5))).toBe("2026-06-05"); // month is 0-indexed
});
```
- [ ] Run `npm test -- sessions` (FAIL). Implement `src/lib/sessions.ts`:
```ts
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  finalizedMeals,
  ingredients,
  mealSessions,
  mealSuggestions,
  type MealSession,
  type MealSuggestion,
} from "@/db/schema";

/** Required ingredients not present (case-insensitive) in the available list. */
export function missingIngredients(required: string[], available: string[]): string[] {
  const have = new Set(available.map((s) => s.trim().toLowerCase()));
  return required.filter((r) => !have.has(r.trim().toLowerCase()));
}

/** Local YYYY-MM-DD for the given date. */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function getOrCreateSession(
  groupId: string,
  sessionDate: string,
  mealType: "lunch" | "dinner",
): Promise<MealSession> {
  await db
    .insert(mealSessions)
    .values({ groupId, sessionDate, mealType })
    .onConflictDoNothing();
  const [session] = await db
    .select()
    .from(mealSessions)
    .where(
      and(
        eq(mealSessions.groupId, groupId),
        eq(mealSessions.sessionDate, sessionDate),
        eq(mealSessions.mealType, mealType),
      ),
    )
    .limit(1);
  return session;
}

export async function getOrCreateTodaySessions(
  groupId: string,
): Promise<{ lunch: MealSession; dinner: MealSession }> {
  const date = toDateString(new Date());
  const [lunch, dinner] = await Promise.all([
    getOrCreateSession(groupId, date, "lunch"),
    getOrCreateSession(groupId, date, "dinner"),
  ]);
  return { lunch, dinner };
}

export async function getSessionSuggestions(
  sessionId: string,
): Promise<MealSuggestion[]> {
  return db
    .select()
    .from(mealSuggestions)
    .where(eq(mealSuggestions.sessionId, sessionId));
}

export async function getAvailableIngredientNames(groupId: string): Promise<string[]> {
  const rows = await db
    .select({ name: ingredients.name })
    .from(ingredients)
    .where(and(eq(ingredients.groupId, groupId), eq(ingredients.available, true)));
  return rows.map((r) => r.name);
}

export async function getRecentMealNames(groupId: string, limit = 10): Promise<string[]> {
  const rows = await db
    .select({ name: finalizedMeals.mealName, at: finalizedMeals.finalizedAt })
    .from(finalizedMeals)
    .innerJoin(mealSessions, eq(finalizedMeals.sessionId, mealSessions.id))
    .where(eq(mealSessions.groupId, groupId))
    .orderBy(desc(finalizedMeals.finalizedAt))
    .limit(limit);
  return rows.map((r) => r.name);
}
```
- [ ] Run `npm test -- sessions` (PASS 2). `npx tsc --noEmit` → exit 0. Commit:
```bash
git add src/lib/sessions.ts src/lib/sessions.test.ts
git commit -m "feat: add sessions library (queries + helpers)"
```

---

## Task 6: generateSuggestions action

- [ ] Create `src/app/(protected)/dashboard/actions.ts`:
```ts
"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import { mealSessions, mealSuggestions } from "@/db/schema";
import { generateMealSuggestions } from "@/lib/ai/gemini";
import { getActiveGroup } from "@/lib/groups";
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

  // Authorize: the session must belong to the user's group.
  const [mealSession] = await db
    .select()
    .from(mealSessions)
    .where(and(eq(mealSessions.id, sessionId), eq(mealSessions.groupId, group.id)))
    .limit(1);
  if (!mealSession) return { error: "Session not found" };

  const [available, recent] = await Promise.all([
    getAvailableIngredientNames(group.id),
    getRecentMealNames(group.id, 10),
  ]);

  let suggestions;
  try {
    suggestions = await generateMealSuggestions({
      availableIngredients: available,
      recentMeals: recent,
      mealType: mealSession.mealType,
    });
  } catch {
    return { error: "Could not reach the AI. Please try again." };
  }

  await db.delete(mealSuggestions).where(eq(mealSuggestions.sessionId, sessionId));
  if (suggestions.length > 0) {
    await db.insert(mealSuggestions).values(
      suggestions.map((s) => ({
        sessionId,
        mealName: s.mealName,
        requiredIngredients: s.requiredIngredients,
        aiGenerated: true,
      })),
    );
  }

  revalidatePath("/dashboard");
  return {};
}
```
- [ ] `npx tsc --noEmit` → exit 0. Commit:
```bash
git add "src/app/(protected)/dashboard/actions.ts"
git commit -m "feat: add generateSuggestions action"
```

---

## Task 7: DashboardView component

- [ ] Failing test `src/components/dashboard/dashboard-view.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

vi.mock("@/app/(protected)/dashboard/actions", () => ({ generateSuggestions: vi.fn() }));

import { DashboardView } from "./dashboard-view";

const sess = (id: string) => ({
  id, groupId: "g", sessionDate: "2026-06-05", mealType: "lunch", status: "open", createdAt: new Date(),
});
const sug = (id: string, name: string, req: string[]) => ({
  id, sessionId: "l", mealName: name, aiGenerated: true, requiredIngredients: req, createdAt: new Date(),
});

const props = {
  available: ["rice", "egg"],
  lunch: { session: sess("l"), suggestions: [sug("1", "Egg Fried Rice", ["egg", "rice"]), sug("2", "Paneer Masala", ["paneer", "cream"])] },
  dinner: { session: { ...sess("d"), mealType: "dinner" }, suggestions: [] },
};

test("shows lunch suggestions with a missing-ingredient flag", () => {
  render(<DashboardView {...props} />);
  expect(screen.getByText("Egg Fried Rice")).toBeInTheDocument();
  expect(screen.getByText("Paneer Masala")).toBeInTheDocument();
  // Paneer Masala needs paneer + cream, neither available
  expect(screen.getByText(/paneer/i)).toBeInTheDocument();
});

test("switches to the dinner tab and shows its empty state", async () => {
  render(<DashboardView {...props} />);
  await userEvent.click(screen.getByRole("tab", { name: /dinner/i }));
  expect(screen.getByText(/no suggestions yet/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /generate/i })).toBeInTheDocument();
});
```
- [ ] Run `npm test -- dashboard-view` (FAIL). Implement `src/components/dashboard/dashboard-view.tsx`:
```tsx
"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import { generateSuggestions } from "@/app/(protected)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Kicker } from "@/components/ui/kicker";
import { missingIngredients } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import type { MealSession, MealSuggestion } from "@/db/schema";

interface SessionData {
  session: MealSession;
  suggestions: MealSuggestion[];
}

export function DashboardView({
  available,
  lunch,
  dinner,
}: {
  available: string[];
  lunch: SessionData;
  dinner: SessionData;
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

      <SessionPanel key={active.session.id} data={active} available={available} />
    </section>
  );
}

function SessionPanel({ data, available }: { data: SessionData; available: string[] }) {
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Kicker>{data.suggestions.length} suggestions</Kicker>
        <Button
          size="sm"
          disabled={pending}
          onClick={() => start(() => generateSuggestions(data.session.id))}
        >
          <Sparkles className="size-4" />
          {pending ? "Generating…" : data.suggestions.length ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {data.suggestions.length === 0 ? (
        <GlassCard className="text-muted-foreground text-sm">
          No suggestions yet. Tap Generate to get AI ideas from your pantry.
        </GlassCard>
      ) : (
        <ul className="space-y-2">
          {data.suggestions.map((s) => {
            const missing = missingIngredients(s.requiredIngredients, available);
            return (
              <li key={s.id}>
                <GlassCard className="space-y-1">
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
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```
- [ ] Run `npm test -- dashboard-view` (PASS 2). Commit:
```bash
git add src/components/dashboard/dashboard-view.tsx src/components/dashboard/dashboard-view.test.tsx
git commit -m "feat: add DashboardView (lunch/dinner tabs + suggestions)"
```

---

## Task 8: Dashboard page wiring

- [ ] Replace `src/app/(protected)/dashboard/page.tsx`:
```tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getActiveGroup } from "@/lib/groups";
import {
  getAvailableIngredientNames,
  getOrCreateTodaySessions,
  getSessionSuggestions,
} from "@/lib/sessions";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const group = await getActiveGroup(session.user.id);
  if (!group) redirect("/onboarding");

  const { lunch, dinner } = await getOrCreateTodaySessions(group.id);
  const [lunchSuggestions, dinnerSuggestions, available] = await Promise.all([
    getSessionSuggestions(lunch.id),
    getSessionSuggestions(dinner.id),
    getAvailableIngredientNames(group.id),
  ]);

  return (
    <DashboardView
      available={available}
      lunch={{ session: lunch, suggestions: lunchSuggestions }}
      dinner={{ session: dinner, suggestions: dinnerSuggestions }}
    />
  );
}
```
- [ ] `npx tsc --noEmit` (exit 0), `npm run lint` (clean), `npm test` (all pass), `npm run build` (Compiled successfully; `/dashboard` dynamic). Commit:
```bash
git add "src/app/(protected)/dashboard/page.tsx"
git commit -m "feat: wire dashboard to sessions + AI suggestions"
```

---

## Task 9: Headless verification (Gemini + DB)

- [ ] Create throwaway `scripts/verify-d.mjs` (run with `node --env-file=.env.local scripts/verify-d.mjs`) that:
  1. Calls the Gemini REST endpoint with a sample prompt (available: onion, potato, rice, egg; recent: Rajma Rice) requesting the JSON schema, and asserts it returns a non-empty array of `{mealName, requiredIngredients}`.
  2. Logs the suggestions so we can eyeball quality.
  (No DB writes needed — the DB paths are covered by the Drizzle queries already used elsewhere and the build. Keep it Gemini-focused.)
- [ ] Run it → expect a parsed, non-empty suggestion list. Delete the script; do not commit.

---

## Self-Review
- **Coverage:** today's lunch+dinner sessions auto-created; AI suggestions generated from available pantry + recent meals; stored with `requiredIngredients`; dashboard shows them per meal with missing-ingredient flags + generate/regenerate. ✓
- **Security:** `generateSuggestions` authorizes the session against the user's group before generating/writing; group derived from session, not client. ✓
- **Testability:** prompt/parse/missingIngredients/toDateString are pure and unit-tested; Gemini client + DB queries verified by build + the headless Gemini check. ✓
- **Boundaries:** voting UI is Plan 5; History (`meal_history`) still deferred; TZ-correct "today" deferred. ✓
- **Type consistency:** `Suggestion` (parse) feeds the action's insert; `MealSession`/`MealSuggestion` exports used by sessions lib, action, DashboardView, page. ✓
