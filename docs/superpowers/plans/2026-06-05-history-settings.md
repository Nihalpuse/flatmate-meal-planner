# History & Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the History screen (past finalized meals) and the Settings screen (group name, shareable invite code, members, theme, logout). Restructure the nav so Settings is reachable on mobile — fixing the mobile-logout gap.

**Architecture:** History is a group-scoped Drizzle query (`finalized_meals ⋈ meal_sessions`) plus a pure `groupHistoryByDate` grouping helper; rendered by a server page. Settings reads group + members via Drizzle and renders a client view (copy invite code, theme selector, logout). The nav's `Voting` item is replaced by `Settings` (voting already lives on the dashboard), keeping 4 tabs and giving mobile users access to logout/settings.

**Tech Stack:** Next.js 16, Drizzle/Neon, next-themes, sonner, Vitest.

Plan 6 (final MVP plan). Depends on Plans 1–5. Mops up: mobile logout, invite-code display. Defers: leave-group, voter avatars.

---

## File Structure

**Created:**
- `src/lib/history.ts` (+`.test.ts` for the pure grouper) — `getMealHistory`, `groupHistoryByDate`
- `src/components/history/history-view.tsx` (+`.test.tsx`)
- `src/lib/settings.ts` — `getGroupSettings`
- `src/components/settings/settings-view.tsx` (+`.test.tsx`)

**Modified:**
- `src/lib/nav.ts` — replace `Voting` with `Settings`
- `src/lib/nav.test.ts`, `src/components/shell/bottom-tab-bar.test.tsx`, `src/components/shell/top-nav.test.tsx` — expect the new nav set
- `src/app/(protected)/history/page.tsx` — wire history
- `src/app/(protected)/settings/page.tsx` — wire settings

---

## Task 1: Nav — replace Voting with Settings

- [ ] In `src/lib/nav.ts`, change the icon import and `NAV_ITEMS`:
  - import: `import { CalendarClock, Carrot, Home, Settings } from "lucide-react";` (drop `Vote`, add `Settings`)
  - `NAV_ITEMS`:
```ts
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/pantry", label: "Pantry", icon: Carrot },
  { href: "/history", label: "History", icon: CalendarClock },
  { href: "/settings", label: "Settings", icon: Settings },
];
```

- [ ] Update `src/lib/nav.test.ts` — the order assertion to:
```ts
  expect(NAV_ITEMS.map((i) => i.href)).toEqual([
    "/dashboard",
    "/pantry",
    "/history",
    "/settings",
  ]);
```

- [ ] Update `src/components/shell/bottom-tab-bar.test.tsx` and `src/components/shell/top-nav.test.tsx`: in each, change the label list being checked from `["Dashboard", "Pantry", "Voting", "History"]` to `["Dashboard", "Pantry", "History", "Settings"]`. (top-nav's pathname mock is `/dashboard`; bottom-tab-bar's is `/pantry` — keep those, just change the label array.)

- [ ] Run `npm test -- nav` , `npm test -- bottom-tab-bar`, `npm test -- top-nav` → all pass. `npx tsc --noEmit` → exit 0. Commit:
```bash
git add src/lib/nav.ts src/lib/nav.test.ts src/components/shell/bottom-tab-bar.test.tsx src/components/shell/top-nav.test.tsx
git commit -m "feat: replace Voting nav item with Settings (mobile access)"
```

---

## Task 2: History library

- [ ] Failing test `src/lib/history.test.ts`:
```ts
import { expect, test } from "vitest";

import { groupHistoryByDate } from "./history";

test("groups entries by date preserving order", () => {
  const entries = [
    { mealName: "Egg Curry", date: "2026-06-05", mealType: "dinner" as const },
    { mealName: "Tomato Rice", date: "2026-06-05", mealType: "lunch" as const },
    { mealName: "Dal", date: "2026-06-04", mealType: "dinner" as const },
  ];
  const days = groupHistoryByDate(entries);
  expect(days.map((d) => d.date)).toEqual(["2026-06-05", "2026-06-04"]);
  expect(days[0].meals).toHaveLength(2);
  expect(days[1].meals[0].mealName).toBe("Dal");
});

test("returns [] for no entries", () => {
  expect(groupHistoryByDate([])).toEqual([]);
});
```

- [ ] Run `npm test -- history` (FAIL). Implement `src/lib/history.ts`:
```ts
import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { finalizedMeals, mealSessions } from "@/db/schema";

export interface HistoryEntry {
  mealName: string;
  date: string;
  mealType: "lunch" | "dinner";
}

export interface DayHistory {
  date: string;
  meals: HistoryEntry[];
}

/** Groups finalized meals by date, preserving the input order. */
export function groupHistoryByDate(entries: HistoryEntry[]): DayHistory[] {
  const days: DayHistory[] = [];
  const byDate = new Map<string, DayHistory>();
  for (const entry of entries) {
    let day = byDate.get(entry.date);
    if (!day) {
      day = { date: entry.date, meals: [] };
      byDate.set(entry.date, day);
      days.push(day);
    }
    day.meals.push(entry);
  }
  return days;
}

export async function getMealHistory(
  groupId: string,
  limit = 60,
): Promise<HistoryEntry[]> {
  const rows = await db
    .select({
      mealName: finalizedMeals.mealName,
      date: mealSessions.sessionDate,
      mealType: mealSessions.mealType,
    })
    .from(finalizedMeals)
    .innerJoin(mealSessions, eq(finalizedMeals.sessionId, mealSessions.id))
    .where(eq(mealSessions.groupId, groupId))
    .orderBy(desc(mealSessions.sessionDate), asc(mealSessions.mealType))
    .limit(limit);
  return rows;
}
```

- [ ] Run `npm test -- history` (PASS 2). `npx tsc --noEmit` → exit 0. Commit:
```bash
git add src/lib/history.ts src/lib/history.test.ts
git commit -m "feat: add meal history library"
```

---

## Task 3: HistoryView + page

- [ ] Failing test `src/components/history/history-view.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { HistoryView } from "./history-view";

test("renders meals grouped by date with meal-type tags", () => {
  render(
    <HistoryView
      entries={[
        { mealName: "Egg Curry", date: "2026-06-05", mealType: "dinner" },
        { mealName: "Tomato Rice", date: "2026-06-05", mealType: "lunch" },
      ]}
    />,
  );
  expect(screen.getByText("Egg Curry")).toBeInTheDocument();
  expect(screen.getByText("Tomato Rice")).toBeInTheDocument();
  expect(screen.getAllByText(/lunch|dinner/i).length).toBeGreaterThanOrEqual(2);
});

test("shows an empty state", () => {
  render(<HistoryView entries={[]} />);
  expect(screen.getByText(/no meals yet/i)).toBeInTheDocument();
});
```

- [ ] Run `npm test -- history-view` (FAIL). Implement `src/components/history/history-view.tsx`:
```tsx
import { GlassCard } from "@/components/ui/glass-card";
import { Kicker } from "@/components/ui/kicker";
import { groupHistoryByDate, type HistoryEntry } from "@/lib/history";

export function HistoryView({ entries }: { entries: HistoryEntry[] }) {
  const days = groupHistoryByDate(entries);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-extrabold">History</h1>

      {days.length === 0 ? (
        <GlassCard className="text-muted-foreground text-sm">
          No meals yet. Finalized meals will show up here.
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {days.map((day) => (
            <div key={day.date} className="space-y-2">
              <div className="text-muted-foreground text-xs font-bold">{day.date}</div>
              {day.meals.map((meal, i) => (
                <GlassCard key={i} className="flex items-center justify-between">
                  <span className="font-bold">{meal.mealName}</span>
                  <Kicker variant="solid">{meal.mealType}</Kicker>
                </GlassCard>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] Run `npm test -- history-view` (PASS 2). Replace `src/app/(protected)/history/page.tsx`:
```tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { HistoryView } from "@/components/history/history-view";
import { getActiveGroup } from "@/lib/groups";
import { getMealHistory } from "@/lib/history";

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const group = await getActiveGroup(session.user.id);
  if (!group) redirect("/onboarding");

  const entries = await getMealHistory(group.id);
  return <HistoryView entries={entries} />;
}
```

- [ ] `npx tsc --noEmit` (exit 0), `npm test` (pass). Commit:
```bash
git add src/components/history/ "src/app/(protected)/history/page.tsx"
git commit -m "feat: add history screen"
```

---

## Task 4: Settings library

- [ ] Implement `src/lib/settings.ts`:
```ts
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { groupMembers, groups, users } from "@/db/schema";

export interface MemberInfo {
  id: string;
  name: string | null;
  role: "admin" | "member";
  isYou: boolean;
}

export interface GroupSettings {
  id: string;
  name: string;
  inviteCode: string;
  role: "admin" | "member";
  members: MemberInfo[];
}

export async function getGroupSettings(userId: string): Promise<GroupSettings | null> {
  const [membership] = await db
    .select({ groupId: groupMembers.groupId, role: groupMembers.role })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .orderBy(asc(groupMembers.joinedAt))
    .limit(1);
  if (!membership) return null;

  const [group] = await db
    .select({ name: groups.name, inviteCode: groups.inviteCode })
    .from(groups)
    .where(eq(groups.id, membership.groupId))
    .limit(1);
  if (!group) return null;

  const memberRows = await db
    .select({ id: users.id, name: users.name, role: groupMembers.role })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, membership.groupId))
    .orderBy(asc(groupMembers.joinedAt));

  return {
    id: membership.groupId,
    name: group.name,
    inviteCode: group.inviteCode,
    role: membership.role,
    members: memberRows.map((m) => ({ ...m, isYou: m.id === userId })),
  };
}
```

- [ ] `npx tsc --noEmit` → exit 0. Commit:
```bash
git add src/lib/settings.ts
git commit -m "feat: add group settings library"
```

---

## Task 5: SettingsView + page

- [ ] Failing test `src/components/settings/settings-view.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system", setTheme: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/app/(auth)/actions", () => ({ signOut: vi.fn() }));

import { SettingsView } from "./settings-view";

const settings = {
  id: "g", name: "Flat 302", inviteCode: "ABC123", role: "admin" as const,
  members: [
    { id: "1", name: "Sam", role: "admin" as const, isYou: true },
    { id: "2", name: "Riya", role: "member" as const, isYou: false },
  ],
};

test("shows group name, invite code, members, and logout", () => {
  render(<SettingsView settings={settings} />);
  expect(screen.getByText("Flat 302")).toBeInTheDocument();
  expect(screen.getByText("ABC123")).toBeInTheDocument();
  expect(screen.getByText("Sam")).toBeInTheDocument();
  expect(screen.getByText("Riya")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
});
```

- [ ] Run `npm test -- settings-view` (FAIL). Implement `src/components/settings/settings-view.tsx`:
```tsx
"use client";

import { useTheme } from "next-themes";
import { toast } from "sonner";

import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Kicker } from "@/components/ui/kicker";
import type { GroupSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const THEMES = ["light", "dark", "system"] as const;

function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex gap-2">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          onClick={() => setTheme(t)}
          className={cn(
            "flex-1 rounded-lg border py-2 text-sm font-semibold capitalize",
            theme === t ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function SettingsView({ settings }: { settings: GroupSettings }) {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-extrabold">Settings</h1>

      <GlassCard className="space-y-1">
        <Kicker>Group</Kicker>
        <div className="text-lg font-extrabold">{settings.name}</div>
      </GlassCard>

      <GlassCard className="space-y-2">
        <Kicker>Invite code</Kicker>
        <div className="flex items-center justify-between gap-3">
          <code className="font-mono text-lg font-bold tracking-wider">{settings.inviteCode}</code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(settings.inviteCode);
              toast.success("Invite code copied");
            }}
          >
            Copy
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">Share this so flatmates can join.</p>
      </GlassCard>

      <GlassCard className="space-y-2">
        <Kicker>Members ({settings.members.length})</Kicker>
        <ul className="space-y-1">
          {settings.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between text-sm">
              <span className="font-semibold">
                {m.name ?? "Member"} {m.isYou ? "(you)" : ""}
              </span>
              <Kicker variant={m.role === "admin" ? "solid" : "plain"}>{m.role}</Kicker>
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard className="space-y-2">
        <Kicker>Theme</Kicker>
        <ThemeSelect />
      </GlassCard>

      <div className="pt-2">
        <LogoutButton />
      </div>
    </section>
  );
}
```

- [ ] Run `npm test -- settings-view` (PASS 1). Replace `src/app/(protected)/settings/page.tsx`:
```tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SettingsView } from "@/components/settings/settings-view";
import { getGroupSettings } from "@/lib/settings";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const settings = await getGroupSettings(session.user.id);
  if (!settings) redirect("/onboarding");

  return <SettingsView settings={settings} />;
}
```

- [ ] `npx tsc --noEmit` (exit 0), `npm run lint` (clean), `npm test` (all pass), `npm run build` (Compiled successfully; `/history` and `/settings` dynamic). Commit:
```bash
git add src/components/settings/ "src/app/(protected)/settings/page.tsx"
git commit -m "feat: add settings screen (invite code, members, theme, logout)"
```

---

## Task 6: Headless verification (history query against Neon)

- [ ] Create throwaway `scripts/verify-f.mjs`: create a group + user + 2 sessions (lunch+dinner) on a date, finalize both, then query the history join (finalized_meals ⋈ meal_sessions by group, ordered date desc) and assert 2 entries come back tagged lunch/dinner; also query group settings (members) and assert the user appears. Clean up. Expect ✓.
- [ ] Run it → ✓. Delete the script; do not commit.

---

## Self-Review
- **Coverage:** History screen (past finalized meals grouped by date, lunch/dinner tags); Settings (group name, copyable invite code, member list with roles + "you", light/dark/system theme, logout). Nav restructured (Voting→Settings) so mobile reaches settings/logout. ✓
- **Mop-up:** mobile logout ✓; invite-code display ✓.
- **Security:** both pages auth-guard + scope to the user's group; history/settings queries filter by the user's group/membership. ✓
- **Deferred:** leave-group, voter avatars, header date. ✓
- **Type consistency:** `HistoryEntry`/`DayHistory` shared by lib + view; `GroupSettings`/`MemberInfo` shared by lib + view; nav tests updated to the new set. ✓
