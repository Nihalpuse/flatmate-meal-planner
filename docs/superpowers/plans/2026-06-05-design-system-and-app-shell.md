# Design System & App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Honey Butter" liquid-glass design system (light + dark) and the responsive app shell (bottom tab bar on mobile, top nav on desktop) so every later feature drops into a styled, navigable skeleton.

**Architecture:** Tailwind v4 CSS-variable tokens define the palette and glass surfaces; `next-themes` drives light/dark/system. Reusable presentational components (GlassCard, CountChip, Badge, BackgroundField) and shell components (BottomTabBar, TopNav, AppShell) are built TDD-first with Vitest + React Testing Library. The existing `(protected)` route group is rewired to render the shell.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn (Base UI), lucide-react, next-themes, Vitest, @testing-library/react.

This is sub-project Plan 1 of 6 (see roadmap in `docs/superpowers/specs/2026-06-05-flatmate-ui-design.md` discussion). It depends on nothing and produces a working, testable styled shell.

---

## File Structure

**Created:**
- `vitest.config.ts` — test runner config (jsdom, react plugin)
- `vitest.setup.ts` — jest-dom matchers + `matchMedia` mock
- `src/lib/nav.ts` — nav item config + `isActive()` helper (pure, testable)
- `src/lib/nav.test.ts`
- `src/components/theme-provider.tsx` — next-themes wrapper
- `src/components/theme-toggle.tsx` + `.test.tsx`
- `src/components/ui/glass-card.tsx` + `.test.tsx`
- `src/components/ui/count-chip.tsx` + `.test.tsx`
- `src/components/ui/kicker.tsx` + `.test.tsx` — Space Mono uppercase label/badge
- `src/components/background-field.tsx` — pastel blurred-shape backdrop
- `src/components/shell/bottom-tab-bar.tsx` + `.test.tsx`
- `src/components/shell/top-nav.tsx`
- `src/components/shell/app-shell.tsx`

**Modified:**
- `package.json` — dev deps + `test` script
- `src/app/globals.css` — replace neutral tokens with Honey Butter tokens + glass tokens
- `src/app/layout.tsx` — swap fonts to Plus Jakarta Sans + Space Mono; mount ThemeProvider
- `src/app/(protected)/layout.tsx` — render via `AppShell` instead of the inline header

---

## Task 1: Test tooling

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`
- Modify: `package.json`

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event
```
Expected: packages added, no errors.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 3: Create `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// jsdom has no matchMedia; next-themes and responsive code need it.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});
```

- [ ] **Step 4: Add the `test` script to `package.json`**

In the `"scripts"` block add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Create a smoke test to prove the runner works**

Create `src/lib/nav.test.ts` temporarily with:
```ts
import { expect, test } from "vitest";
test("vitest is wired up", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 6: Run it**

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts src/lib/nav.test.ts
git commit -m "chore: add vitest + testing-library setup"
```

---

## Task 2: Honey Butter theme tokens

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace the `:root` token block** in `src/app/globals.css`

Replace the entire `:root { ... }` block with (keep the `@theme inline`, `@custom-variant`, and `@layer base` blocks as they are unless noted in Step 3):
```css
:root {
  --radius: 0.625rem;

  /* Honey Butter — light */
  --background: #FBF1DC;
  --foreground: #241F17;
  --card: rgba(255, 255, 255, 0.62);
  --card-foreground: #241F17;
  --popover: #FFFFFF;
  --popover-foreground: #241F17;
  --primary: #C98A2E;
  --primary-foreground: #FFFFFF;
  --secondary: #F4E6CB;
  --secondary-foreground: #241F17;
  --muted: #F1E6CC;
  --muted-foreground: #6A5A38;
  --accent: #C98A2E;
  --accent-foreground: #FFFFFF;
  --destructive: #A8341B;
  --border: rgba(120, 90, 40, 0.18);
  --input: rgba(120, 90, 40, 0.22);
  --ring: #C98A2E;

  /* Custom: deep accent + glass + background shapes */
  --accent-deep: #A6690F;
  --glass-bg: rgba(255, 255, 255, 0.62);
  --glass-border: rgba(255, 255, 255, 0.80);
  --glass-highlight: rgba(255, 255, 255, 0.95);
  --glass-shadow: rgba(120, 90, 40, 0.12);
  --blob-1: #FBE2A8;
  --blob-2: #F7D9B0;
}
```

- [ ] **Step 2: Replace the `.dark` token block**

Replace the entire `.dark { ... }` block with:
```css
.dark {
  /* Honey Butter — dark (warm espresso) */
  --background: #191309;
  --foreground: #F4E9D4;
  --card: rgba(255, 240, 210, 0.08);
  --card-foreground: #F4E9D4;
  --popover: #241A0E;
  --popover-foreground: #F4E9D4;
  --primary: #E0A94A;
  --primary-foreground: #1D1505;
  --secondary: #2A1F10;
  --secondary-foreground: #F4E9D4;
  --muted: #2A1F10;
  --muted-foreground: #BDAC88;
  --accent: #E0A94A;
  --accent-foreground: #1D1505;
  --destructive: #E5614A;
  --border: rgba(255, 225, 170, 0.18);
  --input: rgba(255, 225, 170, 0.22);
  --ring: #E0A94A;

  --accent-deep: #E0A94A;
  --glass-bg: rgba(255, 240, 210, 0.08);
  --glass-border: rgba(255, 225, 170, 0.18);
  --glass-highlight: rgba(255, 235, 190, 0.15);
  --glass-shadow: rgba(0, 0, 0, 0.35);
  --blob-1: #7A5A1E;
  --blob-2: #5A4418;
}
```

- [ ] **Step 3: Expose custom tokens to Tailwind** — inside the existing `@theme inline { ... }` block, add these lines before its closing brace:
```css
  --color-accent-deep: var(--accent-deep);
  --color-blob-1: var(--blob-1);
  --color-blob-2: var(--blob-2);
```

- [ ] **Step 4: Verify the app still builds**

Run: `npm run build`
Expected: "Compiled successfully". (Visual check optional — colors now read cream/amber.)

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: Honey Butter theme tokens (light + dark)"
```

---

## Task 3: Swap fonts to Plus Jakarta Sans + Space Mono

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/globals.css`

- [ ] **Step 1: Update font imports + variables in `src/app/layout.tsx`**

Replace the `Geist`/`Geist_Mono` imports and their `const` declarations with:
```tsx
import { Plus_Jakarta_Sans, Space_Mono } from "next/font/google";

const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const mono = Space_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});
```

- [ ] **Step 2: Update the `<html>` className** in the same file

Change the className expression to use the new variables:
```tsx
className={`${sans.variable} ${mono.variable} h-full antialiased`}
```

- [ ] **Step 3: Fix the mono token mapping in `src/app/globals.css`**

Inside `@theme inline`, change the line `--font-mono: var(--font-geist-mono);` to:
```css
  --font-mono: var(--font-mono);
```
(The `--font-sans` line already reads `var(--font-sans)` and stays.)

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat: use Plus Jakarta Sans + Space Mono fonts"
```

---

## Task 4: Theme provider (light/dark/system)

**Files:**
- Create: `src/components/theme-provider.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Install next-themes**

Run: `npm install next-themes`
Expected: package added.

- [ ] **Step 2: Create `src/components/theme-provider.tsx`**

```tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props} />;
}
```

- [ ] **Step 3: Mount it in `src/app/layout.tsx`**

Add the import:
```tsx
import { ThemeProvider } from "@/components/theme-provider";
```
Wrap `{children}` inside `<body>`:
```tsx
<body className="min-h-full flex flex-col">
  <ThemeProvider
    attribute="class"
    defaultTheme="system"
    enableSystem
    disableTransitionOnChange
  >
    {children}
  </ThemeProvider>
</body>
```
Also add `suppressHydrationWarning` to the `<html>` tag (next-themes sets the class pre-hydration):
```tsx
<html lang="en" suppressHydrationWarning className={...}>
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/theme-provider.tsx src/app/layout.tsx
git commit -m "feat: add next-themes provider (light/dark/system)"
```

---

## Task 5: ThemeToggle component

**Files:**
- Create: `src/components/theme-toggle.tsx`
- Test: `src/components/theme-toggle.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/theme-toggle.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

const setTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme }),
}));

import { ThemeToggle } from "./theme-toggle";

test("renders an accessible toggle button", () => {
  render(<ThemeToggle />);
  expect(screen.getByRole("button", { name: /toggle theme/i })).toBeInTheDocument();
});

test("switches from light to dark on click", async () => {
  render(<ThemeToggle />);
  await userEvent.click(screen.getByRole("button", { name: /toggle theme/i }));
  expect(setTheme).toHaveBeenCalledWith("dark");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- theme-toggle`
Expected: FAIL — cannot find module `./theme-toggle`.

- [ ] **Step 3: Write the implementation**

`src/components/theme-toggle.tsx`:
```tsx
"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- theme-toggle`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/theme-toggle.tsx src/components/theme-toggle.test.tsx
git commit -m "feat: add ThemeToggle component"
```

---

## Task 6: GlassCard component

**Files:**
- Create: `src/components/ui/glass-card.tsx`
- Test: `src/components/ui/glass-card.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/ui/glass-card.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { GlassCard } from "./glass-card";

test("renders children", () => {
  render(<GlassCard>Hello</GlassCard>);
  expect(screen.getByText("Hello")).toBeInTheDocument();
});

test("marks itself with the glass-card slot", () => {
  render(<GlassCard>x</GlassCard>);
  expect(document.querySelector('[data-slot="glass-card"]')).not.toBeNull();
});

test("merges a custom className", () => {
  render(<GlassCard className="custom-x">x</GlassCard>);
  expect(document.querySelector('[data-slot="glass-card"]')).toHaveClass("custom-x");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- glass-card`
Expected: FAIL — cannot find module `./glass-card`.

- [ ] **Step 3: Write the implementation**

`src/components/ui/glass-card.tsx`:
```tsx
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Frosted glass surface. Uses backdrop-blur with a near-opaque fallback so
 * text stays readable where backdrop-filter is unsupported.
 */
export function GlassCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="glass-card"
      className={cn(
        "rounded-[22px] border p-4",
        // fallback first, then progressive glass enhancement
        "bg-card supports-[backdrop-filter]:bg-[var(--glass-bg)]",
        "supports-[backdrop-filter]:backdrop-blur-md supports-[backdrop-filter]:backdrop-saturate-150",
        "border-[var(--glass-border)]",
        "shadow-[0_6px_20px_var(--glass-shadow),inset_0_1px_0_var(--glass-highlight)]",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- glass-card`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/glass-card.tsx src/components/ui/glass-card.test.tsx
git commit -m "feat: add GlassCard surface component"
```

---

## Task 7: Kicker (Space Mono label) component

**Files:**
- Create: `src/components/ui/kicker.tsx`
- Test: `src/components/ui/kicker.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/ui/kicker.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Kicker } from "./kicker";

test("renders uppercase mono label text", () => {
  render(<Kicker>Leading</Kicker>);
  const el = screen.getByText("Leading");
  expect(el).toBeInTheDocument();
  expect(el).toHaveClass("uppercase");
});

test("solid variant applies the accent background", () => {
  render(<Kicker variant="solid">Dinner</Kicker>);
  expect(screen.getByText("Dinner")).toHaveClass("bg-primary");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- kicker`
Expected: FAIL — cannot find module `./kicker`.

- [ ] **Step 3: Write the implementation**

`src/components/ui/kicker.tsx`:
```tsx
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const kickerVariants = cva(
  "inline-block font-mono text-[10px] font-bold uppercase tracking-wider",
  {
    variants: {
      variant: {
        plain: "text-muted-foreground",
        solid: "rounded-full bg-primary px-2 py-0.5 text-primary-foreground",
      },
    },
    defaultVariants: { variant: "plain" },
  },
);

export function Kicker({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof kickerVariants>) {
  return (
    <span className={cn(kickerVariants({ variant }), className)} {...props} />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- kicker`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/kicker.tsx src/components/ui/kicker.test.tsx
git commit -m "feat: add Kicker label component"
```

---

## Task 8: CountChip component

**Files:**
- Create: `src/components/ui/count-chip.tsx`
- Test: `src/components/ui/count-chip.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/ui/count-chip.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { CountChip } from "./count-chip";

test("shows the count", () => {
  render(<CountChip count={3} />);
  expect(screen.getByText("3")).toBeInTheDocument();
});

test("uses the muted style when count is zero", () => {
  render(<CountChip count={0} />);
  expect(screen.getByText("0")).toHaveClass("bg-muted");
});

test("uses the solid accent style when count is positive", () => {
  render(<CountChip count={2} />);
  expect(screen.getByText("2")).toHaveClass("bg-primary");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- count-chip`
Expected: FAIL — cannot find module `./count-chip`.

- [ ] **Step 3: Write the implementation**

`src/components/ui/count-chip.tsx`:
```tsx
import { cn } from "@/lib/utils";

export function CountChip({ count }: { count: number }) {
  const positive = count > 0;
  return (
    <span
      className={cn(
        "flex h-[30px] min-w-[30px] items-center justify-center rounded-[10px] px-2 text-[15px] font-extrabold",
        positive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {count}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- count-chip`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/count-chip.tsx src/components/ui/count-chip.test.tsx
git commit -m "feat: add CountChip component"
```

---

## Task 9: Nav config + isActive helper

**Files:**
- Create: `src/lib/nav.ts`
- Test: `src/lib/nav.test.ts` (replace the smoke test from Task 1)

- [ ] **Step 1: Write the failing test** — replace the contents of `src/lib/nav.test.ts` with:

```ts
import { expect, test } from "vitest";

import { NAV_ITEMS, isActive } from "./nav";

test("exposes the four core destinations in order", () => {
  expect(NAV_ITEMS.map((i) => i.href)).toEqual([
    "/dashboard",
    "/pantry",
    "/voting",
    "/history",
  ]);
});

test("exact match is active", () => {
  expect(isActive("/pantry", "/pantry")).toBe(true);
});

test("nested route activates its parent tab", () => {
  expect(isActive("/voting/lunch", "/voting")).toBe(true);
});

test("unrelated route is not active", () => {
  expect(isActive("/history", "/pantry")).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- nav`
Expected: FAIL — cannot find module `./nav`.

- [ ] **Step 3: Write the implementation**

`src/lib/nav.ts`:
```ts
import { CalendarClock, Carrot, Home, Vote } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/pantry", label: "Pantry", icon: Carrot },
  { href: "/voting", label: "Voting", icon: Vote },
  { href: "/history", label: "History", icon: CalendarClock },
];

/** A tab is active for its exact route or any nested child route. */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- nav`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav.ts src/lib/nav.test.ts
git commit -m "feat: add nav config and isActive helper"
```

---

## Task 10: BottomTabBar (mobile)

**Files:**
- Create: `src/components/shell/bottom-tab-bar.tsx`
- Test: `src/components/shell/bottom-tab-bar.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/shell/bottom-tab-bar.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/pantry" }));

import { BottomTabBar } from "./bottom-tab-bar";

test("renders all four destinations", () => {
  render(<BottomTabBar />);
  for (const label of ["Dashboard", "Pantry", "Voting", "History"]) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
});

test("marks the current route with aria-current", () => {
  render(<BottomTabBar />);
  const pantry = screen.getByRole("link", { name: /pantry/i });
  expect(pantry).toHaveAttribute("aria-current", "page");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bottom-tab-bar`
Expected: FAIL — cannot find module `./bottom-tab-bar`.

- [ ] **Step 3: Write the implementation**

`src/components/shell/bottom-tab-bar.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { GlassCard } from "@/components/ui/glass-card";
import { NAV_ITEMS, isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-3 bottom-3 z-40 md:hidden"
    >
      <GlassCard className="flex items-center justify-around rounded-3xl p-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-bold",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </GlassCard>
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- bottom-tab-bar`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/bottom-tab-bar.tsx src/components/shell/bottom-tab-bar.test.tsx
git commit -m "feat: add mobile BottomTabBar"
```

---

## Task 11: TopNav (desktop)

**Files:**
- Create: `src/components/shell/top-nav.tsx`
- Test: `src/components/shell/top-nav.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/shell/top-nav.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

import { TopNav } from "./top-nav";

test("renders the brand and all destinations", () => {
  render(<TopNav groupName="Flat 302" />);
  expect(screen.getByText(/Flat 302/)).toBeInTheDocument();
  for (const label of ["Dashboard", "Pantry", "Voting", "History"]) {
    expect(screen.getByRole("link", { name: new RegExp(label, "i") })).toBeInTheDocument();
  }
});

test("marks the current route with aria-current", () => {
  render(<TopNav groupName="Flat 302" />);
  expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- top-nav`
Expected: FAIL — cannot find module `./top-nav`.

- [ ] **Step 3: Write the implementation**

`src/components/shell/top-nav.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_ITEMS, isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function TopNav({ groupName }: { groupName: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 hidden border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md md:block">
      <div className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
        <span className="font-extrabold">🍛 {groupName}</span>
        <nav aria-label="Primary" className="flex items-center gap-4 text-sm">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "font-semibold",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- top-nav`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/top-nav.tsx src/components/shell/top-nav.test.tsx
git commit -m "feat: add desktop TopNav"
```

---

## Task 12: BackgroundField (pastel backdrop)

**Files:**
- Create: `src/components/background-field.tsx`

- [ ] **Step 1: Create the component** (purely presentational — no test needed; it renders two blurred shapes and is verified visually in Task 14)

`src/components/background-field.tsx`:
```tsx
/**
 * Fixed pastel backdrop: two large soft blurred shapes the glass refracts.
 * Sits behind all content (-z-10). Colors come from theme tokens.
 */
export function BackgroundField() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <div className="absolute -left-20 -top-16 size-72 rounded-full bg-blob-1 opacity-50 blur-[60px]" />
      <div className="absolute -right-20 bottom-24 size-72 rounded-full bg-blob-2 opacity-50 blur-[60px]" />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 3: Commit**

```bash
git add src/components/background-field.tsx
git commit -m "feat: add BackgroundField pastel backdrop"
```

---

## Task 13: AppShell + wire into protected layout

**Files:**
- Create: `src/components/shell/app-shell.tsx`
- Modify: `src/app/(protected)/layout.tsx`

- [ ] **Step 1: Create `src/components/shell/app-shell.tsx`**

```tsx
import type { ReactNode } from "react";

import { BackgroundField } from "@/components/background-field";
import { BottomTabBar } from "@/components/shell/bottom-tab-bar";
import { TopNav } from "@/components/shell/top-nav";

export function AppShell({
  groupName,
  children,
}: {
  groupName: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <BackgroundField />
      <TopNav groupName={groupName} />
      {/* pb-28 leaves room for the floating mobile tab bar */}
      <main className="mx-auto max-w-4xl px-4 py-6 pb-28 md:pb-6">{children}</main>
      <BottomTabBar />
    </div>
  );
}
```

- [ ] **Step 2: Rewire `src/app/(protected)/layout.tsx`** — replace the entire file with:

```tsx
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Group name is hardcoded until Plan 2 (Auth & Onboarding) wires real groups.
  return <AppShell groupName="Flat 302">{children}</AppShell>;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/app-shell.tsx "src/app/(protected)/layout.tsx"
git commit -m "feat: assemble AppShell and wire into protected layout"
```

---

## Task 14: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all tests pass (theme-toggle, glass-card, kicker, count-chip, nav, bottom-tab-bar, top-nav).

- [ ] **Step 2: Lint + typecheck**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder" npm run build`
Expected: "Compiled successfully".

- [ ] **Step 4: Manual smoke (dev server)**

Run: `npm run dev`, open `http://localhost:3000/dashboard` (you'll be redirected to `/login` if not authed — that's expected; to view the shell, temporarily comment the redirect in the protected layout, or revisit after Plan 2). Confirm: cream background, glass top nav on wide screens, floating glass tab bar on narrow screens, theme toggle flips light/dark.

- [ ] **Step 5: Final commit (if any manual tweaks were made)**

```bash
git add -A
git commit -m "chore: design system & app shell verification"
```

---

## Self-Review

**Spec coverage** (against `2026-06-05-flatmate-ui-design.md`):
- §1 Design Language → Tasks 2, 3, 6, 7, 8, 12 (tokens, fonts, glass, mono labels, chips, backdrop). ✓
- §1 light/dark/system → Tasks 4, 5. ✓
- §2 Navigation (mobile tab bar / desktop top nav, 4 items) → Tasks 9, 10, 11, 13. ✓
- §1 contrast rule (solid chips, accent fills) → Task 8 (CountChip), Task 7 (Kicker solid). ✓
- §4 backdrop-filter fallback → Task 6 GlassCard `supports-[backdrop-filter]` + `bg-card` fallback. ✓
- Screens themselves (Dashboard content, Voting, Pantry, etc.) → **out of scope for Plan 1**, delivered in Plans 2–6. The shell only provides the frame. ✓

**Placeholder scan:** No TBD/TODO; the one intentional hardcode (`groupName="Flat 302"`) is called out as resolved in Plan 2. ✓

**Type consistency:** `NavItem`/`NAV_ITEMS`/`isActive` used identically in Tasks 9–11; `GlassCard`, `CountChip`, `Kicker` props match their tests; token names (`--glass-bg`, `--glass-border`, `--glass-highlight`, `--glass-shadow`, `--blob-1/2`, `--accent-deep`) defined in Task 2 and consumed in Tasks 6, 11, 12. ✓
