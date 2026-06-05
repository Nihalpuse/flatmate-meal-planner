# Auth & Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users sign up / log in with email + password, then create or join a single flat (group), landing them in the themed app shell with their real group name.

**Architecture:** Supabase Auth (email/password) driven by Next.js Server Actions and `useActionState` forms. Group create/join go through two `SECURITY DEFINER` Postgres RPCs that safely bypass the chicken-and-egg RLS on the first membership. The `(protected)` layout resolves the user's active group (redirecting to onboarding if none) and feeds its name to the existing `AppShell`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Supabase Auth + Postgres RPC, zod, Vitest + Testing Library.

This is sub-project Plan 2 of 6. It depends on Plan 1 (design system & shell, already merged to `main`).

**Scope decisions (from brainstorming):**
- **Email/password only** this plan. Google OAuth is a separate later mini-plan.
- **One group per user** in v1 — a user with any membership goes to `/dashboard`; a user with none goes to `/onboarding`. No group switcher.

---

## ⚠️ Prerequisite (manual, do before/at verification)

In the Supabase dashboard → **Authentication → Sign In / Providers → Email**:
- For smooth local development, **turn OFF "Confirm email"** so sign-up creates a session immediately (the flow then goes straight to onboarding).
- If you leave "Confirm email" ON, sign-up returns no session; the UI shows a "check your email" message, and the confirmation link must hit our `/auth/confirm` route (Task 7). Set **Authentication → URL Configuration → Site URL** to `http://localhost:3000` and add it to Redirect URLs.

Also run the new migration `supabase/migrations/20260605000001_group_rpcs.sql` (Task 2) in the SQL Editor (or via the Supabase CLI) before testing create/join.

---

## File Structure

**Created:**
- `supabase/migrations/20260605000001_group_rpcs.sql` — `create_group` + `join_group` SECURITY DEFINER functions
- `src/lib/auth/validation.ts` (+ `.test.ts`) — zod schemas
- `src/lib/groups.ts` (+ `.test.ts`) — `getActiveGroup()`
- `src/app/(auth)/actions.ts` — `signIn`, `signUp`, `signOut` server actions
- `src/components/auth/login-form.tsx` (+ `.test.tsx`)
- `src/components/auth/register-form.tsx` (+ `.test.tsx`)
- `src/components/auth/logout-button.tsx`
- `src/app/auth/confirm/route.ts` — email-confirmation handler
- `src/app/onboarding/layout.tsx` — auth-guarded, shell-less, redirects to dashboard if already in a group
- `src/app/onboarding/page.tsx`
- `src/app/onboarding/actions.ts` — `createGroup`, `joinGroup`
- `src/components/onboarding/create-group-form.tsx` (+ `.test.tsx`)
- `src/components/onboarding/join-group-form.tsx` (+ `.test.tsx`)

**Modified:**
- `package.json` — add `zod`
- `src/types/database.ts` — add `public.Functions` for the two RPCs
- `src/app/(auth)/login/page.tsx` — render `LoginForm`; redirect authed users to `/dashboard`
- `src/app/(auth)/register/page.tsx` — render `RegisterForm`; redirect authed users to `/dashboard`
- `src/app/(protected)/layout.tsx` — resolve real active group; redirect to `/onboarding` if none
- `src/lib/supabase/middleware.ts` — add `/onboarding` to protected prefixes
- `src/components/shell/top-nav.tsx` — add `LogoutButton`

---

## Task 1: Auth validation schemas (zod)

**Files:** Create `src/lib/auth/validation.ts`, `src/lib/auth/validation.test.ts`; Modify `package.json`

- [ ] **Step 1: Install zod**

Run: `npm install zod`
Expected: package added.

- [ ] **Step 2: Write the failing test** — `src/lib/auth/validation.test.ts`:

```ts
import { expect, test } from "vitest";

import { signInSchema, signUpSchema } from "./validation";

test("signInSchema accepts valid credentials", () => {
  const r = signInSchema.safeParse({ email: "a@b.com", password: "secret" });
  expect(r.success).toBe(true);
});

test("signInSchema rejects a bad email", () => {
  const r = signInSchema.safeParse({ email: "nope", password: "secret" });
  expect(r.success).toBe(false);
});

test("signUpSchema requires an 8+ char password", () => {
  const r = signUpSchema.safeParse({ name: "Sam", email: "a@b.com", password: "short" });
  expect(r.success).toBe(false);
});

test("signUpSchema requires a name", () => {
  const r = signUpSchema.safeParse({ name: "", email: "a@b.com", password: "longenough" });
  expect(r.success).toBe(false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- validation`
Expected: FAIL — cannot find module `./validation`.

- [ ] **Step 4: Implement** — `src/lib/auth/validation.ts`:

```ts
import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- validation`
Expected: PASS (4). (If the installed zod is v4 and `.email()` emits a deprecation, the test still passes; leave as-is.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/auth/validation.ts src/lib/auth/validation.test.ts
git commit -m "feat: add auth validation schemas"
```

---

## Task 2: Group RPC migration + DB Functions types

**Files:** Create `supabase/migrations/20260605000001_group_rpcs.sql`; Modify `src/types/database.ts`

- [ ] **Step 1: Create the migration** — `supabase/migrations/20260605000001_group_rpcs.sql`:

```sql
-- create_group: makes a group + adds the caller as admin, bypassing the
-- bootstrap RLS gap (a user can't insert their own first admin membership).
create or replace function create_group(group_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  code text;
  attempts int := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into groups (name, invite_code, created_by)
      values (trim(group_name), code, auth.uid())
      returning id into new_id;
      exit;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts > 5 then raise; end if;
    end;
  end loop;

  insert into group_members (group_id, user_id, role)
  values (new_id, auth.uid(), 'admin');

  return new_id;
end; $$;

-- join_group: looks up a group by invite code (members-only RLS would block a
-- non-member SELECT) and adds the caller as a member. Returns null if no match.
create or replace function join_group(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into gid
  from groups
  where groups.invite_code = upper(trim(join_group.invite_code));

  if gid is null then
    return null;
  end if;

  insert into group_members (group_id, user_id, role)
  values (gid, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  return gid;
end; $$;

grant execute on function create_group(text) to authenticated;
grant execute on function join_group(text)  to authenticated;
```

- [ ] **Step 2: Apply the migration** — paste the file's contents into the Supabase dashboard SQL Editor and run it (or `supabase db push`). Verify both functions appear under Database → Functions.

- [ ] **Step 3: Add the Functions type** — in `src/types/database.ts`, inside the `Database["public"]` object, add a `Functions` member alongside `Tables`/`Views`/`Enums`:

```ts
    Functions: {
      create_group: { Args: { group_name: string }; Returns: string };
      join_group: { Args: { invite_code: string }; Returns: string | null };
    };
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260605000001_group_rpcs.sql src/types/database.ts
git commit -m "feat: add create_group/join_group RPCs and types"
```

---

## Task 3: getActiveGroup helper

**Files:** Create `src/lib/groups.ts`, `src/lib/groups.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/groups.test.ts`:

```ts
import { expect, test, vi } from "vitest";

import { getActiveGroup } from "./groups";

function fakeSupabase(returnData: unknown) {
  const chain = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: returnData, error: null })),
  };
  return { from: vi.fn(() => chain) } as never;
}

test("returns the joined group when the user has a membership", async () => {
  const supabase = fakeSupabase({ groups: { id: "g1", name: "Flat 302" } });
  expect(await getActiveGroup(supabase)).toEqual({ id: "g1", name: "Flat 302" });
});

test("returns null when the user has no membership", async () => {
  const supabase = fakeSupabase(null);
  expect(await getActiveGroup(supabase)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- groups`
Expected: FAIL — cannot find module `./groups`.

- [ ] **Step 3: Implement** — `src/lib/groups.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export interface ActiveGroup {
  id: string;
  name: string;
}

/**
 * The user's single active group (earliest membership), or null if none.
 * RLS limits `group_members` rows to the current user's own memberships.
 */
export async function getActiveGroup(
  supabase: SupabaseClient<Database>,
): Promise<ActiveGroup | null> {
  const { data } = await supabase
    .from("group_members")
    .select("groups(id, name)")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const group = (data?.groups ?? null) as ActiveGroup | null;
  return group;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- groups`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add src/lib/groups.ts src/lib/groups.test.ts
git commit -m "feat: add getActiveGroup helper"
```

---

## Task 4: Auth server actions

**Files:** Create `src/app/(auth)/actions.ts`

- [ ] **Step 1: Implement** — `src/app/(auth)/actions.ts` (server actions; tested indirectly via the form tests in Task 5 and manual verification — no separate unit test):

```ts
"use server";

import { redirect } from "next/navigation";

import { signInSchema, signUpSchema } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.name } },
  });
  if (error) {
    return { error: error.message };
  }

  if (!data.session) {
    return { message: "Check your email to confirm your account, then log in." };
  }

  redirect("/onboarding");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(auth)/actions.ts"
git commit -m "feat: add email/password auth server actions"
```

---

## Task 5: Login & Register forms + pages

**Files:** Create `src/components/auth/login-form.tsx` (+ `.test.tsx`), `src/components/auth/register-form.tsx` (+ `.test.tsx`); Modify `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`

- [ ] **Step 1: Write the failing test** — `src/components/auth/login-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@/app/(auth)/actions", () => ({ signIn: vi.fn() }));

import { LoginForm } from "./login-form";

test("renders email and password fields and a submit button", () => {
  render(<LoginForm />);
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- login-form`
Expected: FAIL — cannot find module `./login-form`.

- [ ] **Step 3: Implement** — `src/components/auth/login-form.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn, type AuthState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

const initial: AuthState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initial);

  return (
    <form action={formAction} className="space-y-4">
      <h1 className="text-2xl font-extrabold">Log in</h1>

      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-semibold">Email</label>
        <input
          id="email" name="email" type="email" required autoComplete="email"
          className="w-full rounded-lg border bg-card px-3 py-2"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-semibold">Password</label>
        <input
          id="password" name="password" type="password" required autoComplete="current-password"
          className="w-full rounded-lg border bg-card px-3 py-2"
        />
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Logging in…" : "Log in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link href="/register" className="font-semibold text-primary">Create one</Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- login-form`
Expected: PASS (1).

- [ ] **Step 5: Write the failing test** — `src/components/auth/register-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@/app/(auth)/actions", () => ({ signUp: vi.fn() }));

import { RegisterForm } from "./register-form";

test("renders name, email, password fields and a submit button", () => {
  render(<RegisterForm />);
  expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- register-form`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement** — `src/components/auth/register-form.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUp, type AuthState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

const initial: AuthState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(signUp, initial);

  return (
    <form action={formAction} className="space-y-4">
      <h1 className="text-2xl font-extrabold">Create account</h1>

      <div className="space-y-1">
        <label htmlFor="name" className="text-sm font-semibold">Name</label>
        <input
          id="name" name="name" type="text" required autoComplete="name"
          className="w-full rounded-lg border bg-card px-3 py-2"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-semibold">Email</label>
        <input
          id="email" name="email" type="email" required autoComplete="email"
          className="w-full rounded-lg border bg-card px-3 py-2"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-semibold">Password</label>
        <input
          id="password" name="password" type="password" required autoComplete="new-password"
          className="w-full rounded-lg border bg-card px-3 py-2"
        />
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.message ? <p className="text-sm text-primary">{state.message}</p> : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Have an account?{" "}
        <Link href="/login" className="font-semibold text-primary">Log in</Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- register-form`
Expected: PASS (1).

- [ ] **Step 9: Wire the pages** — replace `src/app/(auth)/login/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return <LoginForm />;
}
```

Replace `src/app/(auth)/register/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/register-form";
import { createClient } from "@/lib/supabase/server";

export default async function RegisterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return <RegisterForm />;
}
```

- [ ] **Step 10: Build**

Run: `NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder" npm run build`
Expected: "Compiled successfully".

- [ ] **Step 11: Commit**

```bash
git add src/components/auth/login-form.tsx src/components/auth/login-form.test.tsx src/components/auth/register-form.tsx src/components/auth/register-form.test.tsx "src/app/(auth)/login/page.tsx" "src/app/(auth)/register/page.tsx"
git commit -m "feat: add login and register forms"
```

---

## Task 6: Email confirmation route

**Files:** Create `src/app/auth/confirm/route.ts`

- [ ] **Step 1: Implement** — `src/app/auth/confirm/route.ts` (handles the link Supabase emails when "Confirm email" is on):

```ts
import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/onboarding";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=confirm", request.url));
}
```

- [ ] **Step 2: Build**

Run: `NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder" npm run build`
Expected: "Compiled successfully" — and `/auth/confirm` appears in the route list.

- [ ] **Step 3: Commit**

```bash
git add src/app/auth/confirm/route.ts
git commit -m "feat: add email confirmation route handler"
```

---

## Task 7: Onboarding (create / join group)

**Files:** Create `src/app/onboarding/actions.ts`, `src/app/onboarding/layout.tsx`, `src/app/onboarding/page.tsx`, `src/components/onboarding/create-group-form.tsx` (+ `.test.tsx`), `src/components/onboarding/join-group-form.tsx` (+ `.test.tsx`)

- [ ] **Step 1: Implement the actions** — `src/app/onboarding/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type OnboardingState = { error?: string };

export async function createGroup(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Group name is required" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_group", { group_name: name });
  if (error) return { error: error.message };

  redirect("/dashboard");
}

export async function joinGroup(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Invite code is required" };

  const supabase = await createClient();
  const { data: groupId, error } = await supabase.rpc("join_group", {
    invite_code: code,
  });
  if (error) return { error: error.message };
  if (!groupId) return { error: "No group found for that code" };

  redirect("/dashboard");
}
```

- [ ] **Step 2: Write the failing test** — `src/components/onboarding/create-group-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@/app/onboarding/actions", () => ({ createGroup: vi.fn() }));

import { CreateGroupForm } from "./create-group-form";

test("renders a group-name field and a create button", () => {
  render(<CreateGroupForm />);
  expect(screen.getByLabelText(/group name/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /create group/i })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- create-group-form`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement** — `src/components/onboarding/create-group-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";

import { createGroup, type OnboardingState } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";

const initial: OnboardingState = {};

export function CreateGroupForm() {
  const [state, formAction, pending] = useActionState(createGroup, initial);

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="name" className="text-sm font-semibold">Group name</label>
        <input
          id="name" name="name" type="text" required placeholder="Flat 302"
          className="w-full rounded-lg border bg-card px-3 py-2"
        />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create group"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- create-group-form`
Expected: PASS (1).

- [ ] **Step 6: Write the failing test** — `src/components/onboarding/join-group-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@/app/onboarding/actions", () => ({ joinGroup: vi.fn() }));

import { JoinGroupForm } from "./join-group-form";

test("renders an invite-code field and a join button", () => {
  render(<JoinGroupForm />);
  expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /join/i })).toBeInTheDocument();
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- join-group-form`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement** — `src/components/onboarding/join-group-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";

import { joinGroup, type OnboardingState } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";

const initial: OnboardingState = {};

export function JoinGroupForm() {
  const [state, formAction, pending] = useActionState(joinGroup, initial);

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="code" className="text-sm font-semibold">Invite code</label>
        <input
          id="code" name="code" type="text" required placeholder="ABC123"
          className="w-full rounded-lg border bg-card px-3 py-2 uppercase"
        />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={pending} variant="outline" className="w-full">
        {pending ? "Joining…" : "Join group"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- join-group-form`
Expected: PASS (1).

- [ ] **Step 10: Create the onboarding layout** — `src/app/onboarding/layout.tsx` (auth-guarded, no shell/tab bar; if the user already has a group, skip to dashboard):

```tsx
import { redirect } from "next/navigation";

import { getActiveGroup } from "@/lib/groups";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const group = await getActiveGroup(supabase);
  if (group) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
```

- [ ] **Step 11: Create the onboarding page** — `src/app/onboarding/page.tsx`:

```tsx
import { CreateGroupForm } from "@/components/onboarding/create-group-form";
import { JoinGroupForm } from "@/components/onboarding/join-group-form";
import { GlassCard } from "@/components/ui/glass-card";

export default function OnboardingPage() {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold">🍛 Get set up</h1>
        <p className="text-sm text-muted-foreground">Create a flat or join one with a code.</p>
      </div>

      <GlassCard className="space-y-3">
        <h2 className="font-bold">Create a group</h2>
        <CreateGroupForm />
      </GlassCard>

      <GlassCard className="space-y-3">
        <h2 className="font-bold">Join a group</h2>
        <JoinGroupForm />
      </GlassCard>
    </div>
  );
}
```

- [ ] **Step 12: Build**

Run: `NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder" npm run build`
Expected: "Compiled successfully".

- [ ] **Step 13: Commit**

```bash
git add "src/app/onboarding" src/components/onboarding
git commit -m "feat: add onboarding (create/join group)"
```

---

## Task 8: Wire real group into shell + logout + protect onboarding

**Files:** Modify `src/app/(protected)/layout.tsx`, `src/lib/supabase/middleware.ts`, `src/components/shell/top-nav.tsx`; Create `src/components/auth/logout-button.tsx`

- [ ] **Step 1: Resolve the real group in the protected layout** — replace `src/app/(protected)/layout.tsx` with:

```tsx
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { getActiveGroup } from "@/lib/groups";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const group = await getActiveGroup(supabase);
  if (!group) redirect("/onboarding");

  return <AppShell groupName={group.name}>{children}</AppShell>;
}
```

- [ ] **Step 2: Protect `/onboarding` in middleware** — in `src/lib/supabase/middleware.ts`, add `"/onboarding"` to the `PROTECTED_PREFIXES` array:

```ts
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/pantry",
  "/voting",
  "/history",
  "/settings",
  "/onboarding",
];
```

- [ ] **Step 3: Create the logout button** — `src/components/auth/logout-button.tsx`:

```tsx
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="sm">Log out</Button>
    </form>
  );
}
```

- [ ] **Step 4: Add it to the TopNav** — in `src/components/shell/top-nav.tsx`, import the button and render it next to `ThemeToggle`:

Add import:
```tsx
import { LogoutButton } from "@/components/auth/logout-button";
```
Change the right-hand controls block from:
```tsx
        <div className="ml-auto">
          <ThemeToggle />
        </div>
```
to:
```tsx
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <LogoutButton />
        </div>
```

- [ ] **Step 5: Run the TopNav test (still green) + full suite**

Run: `npm test -- top-nav` then `npm test`
Expected: top-nav 2 pass; full suite all pass.

- [ ] **Step 6: Build**

Run: `NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder" npm run build`
Expected: "Compiled successfully".

- [ ] **Step 7: Commit**

```bash
git add "src/app/(protected)/layout.tsx" src/lib/supabase/middleware.ts src/components/auth/logout-button.tsx src/components/shell/top-nav.tsx
git commit -m "feat: resolve real group, protect onboarding, add logout"
```

---

## Task 9: Full verification

**Files:** none

- [ ] **Step 1: Full test suite** — `npm test` → all pass (validation, groups, login-form, register-form, create-group-form, join-group-form, plus the Plan 1 suite).

- [ ] **Step 2: Lint + typecheck** — `npx tsc --noEmit && npm run lint` → no errors.

- [ ] **Step 3: Production build** — `NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder" npm run build` → "Compiled successfully". Confirm routes exist for `/login`, `/register`, `/onboarding`, `/auth/confirm`.

- [ ] **Step 4: Manual end-to-end** (requires the Task 2 migration applied and the Supabase email prerequisite). With real `.env.local`: `npm run dev`, then register a new user → land on `/onboarding` → create "Flat 302" → land on `/dashboard` with "🍛 Flat 302" in the desktop header → Log out → log back in → still goes to the dashboard. In a second account, Join via the first group's invite code (find it in Supabase `groups` table for now; Settings UI lands in Plan 6).

- [ ] **Step 5: Commit any verification tweaks** (skip if none — do not create an empty commit).

---

## Self-Review

**Spec coverage** (UI spec §3 Auth + Onboarding):
- Login / Register (email + password) → Tasks 4, 5. ✓
- Create group (name → invite code) / Join group (code) → Tasks 2, 7. ✓
- New users → onboarding; returning members → dashboard → Tasks 3, 7 (onboarding layout), 8 (protected layout). ✓
- Real group name in the shell header → Task 8. ✓
- Logout → Task 8. ✓
- Google login → **intentionally deferred** to a later mini-plan (scope decision). ✓
- Invite code surfaced in UI for sharing → **deferred to Plan 6 (Settings)**; for now it's readable in the DB. Noted, not a gap for this plan.

**Placeholder scan:** No TBD/TODO. The RLS bootstrap gap is resolved via the Task 2 RPCs rather than left as a comment.

**Type consistency:** `AuthState` (Task 4) consumed by both auth forms (Task 5); `OnboardingState` (Task 7) consumed by both onboarding forms; `getActiveGroup`/`ActiveGroup` (Task 3) used in onboarding layout and protected layout (Task 8); the `create_group`/`join_group` RPC names and arg keys (`group_name`, `invite_code`) match between the SQL (Task 2), the `Database["public"]["Functions"]` types (Task 2), and the action calls (Task 7).
