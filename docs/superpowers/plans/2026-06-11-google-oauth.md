# Google OAuth Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Continue with Google" sign-in to the login and register pages via Auth.js v5 + `@auth/drizzle-adapter`, persisting Google users in our `users`/`accounts` tables while keeping JWT sessions and the existing email+password flow.

**Architecture:** The Drizzle adapter (explicit table mapping) is added to the node-only `auth.ts` alongside the Google provider; the edge `auth.config.ts` stays DB-free. Two previously-dropped tables (`sessions`, `verification_tokens`) are restored so the adapter has its full schema. A small server action triggers the OAuth redirect; a shared client button is dropped into both auth forms, gated on a server-provided `googleEnabled` flag.

**Tech Stack:** Next.js 16 App Router (server components; `searchParams` is a Promise), Auth.js v5 (`next-auth@5.0.0-beta.31`), `@auth/drizzle-adapter@^1.11`, Drizzle ORM + Neon, zod v4, Vitest + Testing Library.

## Global Constraints

- Session strategy stays `jwt` (already set in `auth.config.ts`) — required by the Credentials provider.
- The adapter and Google provider go ONLY in `src/auth.ts` (node), never in `src/auth.config.ts` (edge, used by the proxy/middleware — must stay DB-free).
- Google provider uses `allowDangerousEmailAccountLinking: true`.
- Env vars `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are optional; the Google button only renders when both are present (`googleEnabled`).
- Run a single test with `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`. Commit after each task. Work on branch `google-oauth` (already created; the spec is already committed there).

---

### Task 1: Restore adapter tables + install adapter

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `package.json` / lockfile (new dependency)
- Create (generated): `drizzle/0002_*.sql`

**Interfaces:**
- Produces: `sessions` and `verificationTokens` table exports in `@/db/schema`; `@auth/drizzle-adapter` available to import.

- [ ] **Step 1: Install the adapter**

Run: `npm install @auth/drizzle-adapter`
Expected: adds `@auth/drizzle-adapter` to dependencies.

- [ ] **Step 2: Restore the two tables in `src/db/schema.ts`**

The `primaryKey` import is already present (used by `accounts`). Add these two exports immediately after the `accounts` table definition:

```ts
export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/0002_<name>.sql` containing `CREATE TABLE "sessions"` and `CREATE TABLE "verification_tokens"`.

- [ ] **Step 4: Apply the migration**

Run: `npm run db:migrate`
Expected: completes without error.

> If this step is blocked (remote DB permissions), STOP and ask the user to run `npm run db:migrate` themselves, then continue. The code in later tasks does not import these tables at module load beyond the adapter mapping, but the adapter needs them present at runtime for OAuth.

- [ ] **Step 5: Verify typecheck + existing tests**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all existing tests PASS (schema additions don't affect them).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: restore adapter tables, add @auth/drizzle-adapter"
```

---

### Task 2: Env vars for Google credentials

**Files:**
- Modify: `src/env.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `env.AUTH_GOOGLE_ID` and `env.AUTH_GOOGLE_SECRET` (both `string | undefined`).

- [ ] **Step 1: Add the vars to `src/env.ts`**

In the `envSchema` object (after `GEMINI_API_KEY`):

```ts
  AUTH_GOOGLE_ID: z.string().min(1).optional(),
  AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
```

And in the `envSchema.parse({...})` call, add:

```ts
  AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
  AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
```

- [ ] **Step 2: Document in `.env.example`**

Append:

```
# Google OAuth — https://console.cloud.google.com/apis/credentials
# Authorized redirect URI: {APP_URL}/api/auth/callback/google
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/env.ts .env.example
git commit -m "feat: AUTH_GOOGLE_ID/SECRET env vars"
```

---

### Task 3: Wire the adapter + Google provider into auth.ts

**Files:**
- Modify: `src/auth.ts`

**Interfaces:**
- Consumes: `sessions`, `verificationTokens` (Task 1); `@auth/drizzle-adapter`.
- Produces: a Google provider on the NextAuth instance; `auth()` recognizes Google logins.

- [ ] **Step 1: Rewrite `src/auth.ts`**

```ts
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";

import { authConfig } from "@/auth.config";
import { db } from "@/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";
import { signInSchema } from "@/lib/auth/validation";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const rows = await db
          .select()
          .from(users)
          .where(eq(users.email, parsed.data.email))
          .limit(1);
        const user = rows[0];
        if (!user?.password) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.password);
        if (!ok) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
    Google({ allowDangerousEmailAccountLinking: true }),
  ],
});
```

- [ ] **Step 2: Verify typecheck + existing auth tests**

Run: `npm run typecheck && npx vitest run src/components/auth src/lib/auth`
Expected: PASS — the Credentials flow and its validation are unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/auth.ts
git commit -m "feat: add Drizzle adapter + Google provider to auth"
```

---

### Task 4: signInWithGoogle server action

**Files:**
- Modify: `src/app/(auth)/actions.ts`

**Interfaces:**
- Produces: `signInWithGoogle(): Promise<void>` — triggers the Google OAuth redirect, ending at `/dashboard`.

- [ ] **Step 1: Add the action to `src/app/(auth)/actions.ts`**

The file already imports `signIn as authSignIn`. Append:

```ts
export async function signInWithGoogle(): Promise<void> {
  await authSignIn("google", { redirectTo: "/dashboard" });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(auth)/actions.ts"
git commit -m "feat: signInWithGoogle server action"
```

---

### Task 5: Shared Google button component

**Files:**
- Create: `src/components/auth/google-button.tsx`
- Test: `src/components/auth/google-button.test.tsx`

**Interfaces:**
- Consumes: `signInWithGoogle` (Task 4).
- Produces: `GoogleButton` component (no props) — a client button that calls `signInWithGoogle` in a transition.

- [ ] **Step 1: Write the failing test** — `src/components/auth/google-button.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

const { signInWithGoogle } = vi.hoisted(() => ({ signInWithGoogle: vi.fn() }));
vi.mock("@/app/(auth)/actions", () => ({ signInWithGoogle }));

import { GoogleButton } from "./google-button";

test("renders and triggers the Google sign-in action", async () => {
  render(<GoogleButton />);
  const btn = screen.getByRole("button", { name: /continue with google/i });
  expect(btn).toBeInTheDocument();
  await userEvent.click(btn);
  expect(signInWithGoogle).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/auth/google-button.test.tsx`
Expected: FAIL — cannot find module `./google-button`.

- [ ] **Step 3: Implement** — `src/components/auth/google-button.tsx`

```tsx
"use client";

import { useTransition } from "react";

import { signInWithGoogle } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export function GoogleButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={pending}
      onClick={() => start(() => signInWithGoogle())}
    >
      {pending ? "Redirecting…" : "Continue with Google"}
    </Button>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/auth/google-button.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/google-button.tsx src/components/auth/google-button.test.tsx
git commit -m "feat: shared Continue-with-Google button"
```

---

### Task 6: Add the button + divider to both forms (gated)

**Files:**
- Modify: `src/components/auth/login-form.tsx`
- Modify: `src/components/auth/register-form.tsx`
- Modify: `src/components/auth/login-form.test.tsx`
- Modify: `src/components/auth/register-form.test.tsx`

**Interfaces:**
- Consumes: `GoogleButton` (Task 5).
- Produces: `LoginForm` and `RegisterForm` now accept `{ googleEnabled?: boolean }`; render `GoogleButton` + an "or" divider above the form only when `googleEnabled`.

- [ ] **Step 1: Write failing tests** — edit `src/components/auth/login-form.test.tsx`

The file already has `vi.mock("@/app/(auth)/actions", () => ({ signIn: vi.fn() }))`. Add `signInWithGoogle` to that same factory (it fully replaces the module, so the button's import resolves):

```tsx
vi.mock("@/app/(auth)/actions", () => ({ signIn: vi.fn(), signInWithGoogle: vi.fn() }));
```

Then append the tests:

```tsx
test("shows the Google button when enabled", () => {
  render(<LoginForm googleEnabled />);
  expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
});

test("hides the Google button when not enabled", () => {
  render(<LoginForm />);
  expect(screen.queryByRole("button", { name: /continue with google/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/auth/login-form.test.tsx`
Expected: FAIL — `LoginForm` doesn't accept `googleEnabled` / no Google button.

- [ ] **Step 3: Implement in `src/components/auth/login-form.tsx`**

Add the import:

```tsx
import { GoogleButton } from "@/components/auth/google-button";
```

Change the signature:

```tsx
export function LoginForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
```

Immediately after the `<h1>Log in</h1>` line, insert the gated button + divider:

```tsx
      {googleEnabled ? (
        <div className="space-y-3">
          <GoogleButton />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}
```

- [ ] **Step 4: Mirror in `src/components/auth/register-form.tsx`**

Add the same import; change signature to `export function RegisterForm({ googleEnabled = false }: { googleEnabled?: boolean })`; insert the same gated block immediately after `<h1>Create account</h1>`.

- [ ] **Step 5: Mirror the tests in `src/components/auth/register-form.test.tsx`**

Change its mock to `vi.mock("@/app/(auth)/actions", () => ({ signUp: vi.fn(), signInWithGoogle: vi.fn() }))`, then append:

```tsx
test("shows the Google button when enabled", () => {
  render(<RegisterForm googleEnabled />);
  expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
});

test("hides the Google button when not enabled", () => {
  render(<RegisterForm />);
  expect(screen.queryByRole("button", { name: /continue with google/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npx vitest run src/components/auth`
Expected: PASS (existing form tests still pass — `googleEnabled` defaults to false).

- [ ] **Step 7: Commit**

```bash
git add src/components/auth/login-form.tsx src/components/auth/register-form.tsx src/components/auth/login-form.test.tsx src/components/auth/register-form.test.tsx
git commit -m "feat: gated Google button + divider in auth forms"
```

---

### Task 7: Wire pages — pass googleEnabled, show OAuth error

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/register/page.tsx`

**Interfaces:**
- Consumes: `LoginForm`/`RegisterForm` `googleEnabled` prop (Task 6); `env.AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`.

- [ ] **Step 1: Update `src/app/(auth)/login/page.tsx`**

`searchParams` is a Promise in Next 16. Read the OAuth `error` and pass `googleEnabled`:

```tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";
import { env } from "@/env";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { error } = await searchParams;
  const googleEnabled = Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-destructive text-sm">Google sign-in failed. Please try again.</p>
      ) : null}
      <LoginForm googleEnabled={googleEnabled} />
    </div>
  );
}
```

- [ ] **Step 2: Update `src/app/(auth)/register/page.tsx`**

```tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { RegisterForm } from "@/components/auth/register-form";
import { env } from "@/env";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const googleEnabled = Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
  return <RegisterForm googleEnabled={googleEnabled} />;
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/login/page.tsx" "src/app/(auth)/register/page.tsx"
git commit -m "feat: pass googleEnabled to auth forms, show OAuth error on login"
```

---

### Task 8: Full verification + manual OAuth smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the whole gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: lint clean, typecheck clean, all tests pass, build succeeds.

- [ ] **Step 2: Manual OAuth round-trip (requires real Google credentials)**

Prereq: a Google Cloud OAuth client; set `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` in `.env.local`; add redirect URI `http://localhost:3000/api/auth/callback/google` in the Google console. Then:

`npm run dev` → `/login` → **Continue with Google** → consent → expect redirect to `/dashboard`, then `/onboarding` if you have no group. Confirm a row appears in `users` (and `accounts`) for the Google identity. Sign out, then sign in with email+password using the same email → confirm it logs into the same account (linking works).

- [ ] **Step 3: Commit any fixes** (only if Step 1 required changes)

```bash
git add -A
git commit -m "chore: google oauth polish"
```

---

## Self-review notes (addressed)

- **Spec coverage:** adapter + tables (Task 1), env (Task 2), provider/JWT/linking wiring (Task 3), redirect action (Task 4), button (Task 5), gated UI + divider (Task 6), `googleEnabled` gating + `OAuthAccountNotLinked`-avoided error display (Task 7), manual round-trip (Task 8). Callbacks unchanged — confirmed in spec, no task needed.
- **Placeholder scan:** none; all steps carry full code.
- **Type consistency:** `googleEnabled?: boolean` identical across Tasks 6–7; `signInWithGoogle(): Promise<void>` identical across Tasks 4–6; adapter table names match the `@/db/schema` exports added in Task 1.
- **Edge safety:** all DB/provider wiring is in `auth.ts`; `auth.config.ts` untouched.
