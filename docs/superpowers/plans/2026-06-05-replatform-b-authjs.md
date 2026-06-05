# Re-platform B — Auth.js + Groups on Drizzle

**Goal:** Replace Supabase Auth with Auth.js (Credentials + JWT) and move group create/join + the auth guard onto Drizzle/Neon, with app-layer authorization replacing RLS.

**Architecture:** Auth.js v5 split into an edge-safe `auth.config.ts` (used by the proxy/middleware for route protection) and a Node `auth.ts` (Credentials provider that verifies bcrypt passwords against the Drizzle `users` table; JWT sessions). Group DB logic lives in `src/lib/groups.ts` as plain async functions taking a `userId` (so they're directly testable against Neon); server actions are thin wrappers that call `auth()` then those functions. Authorization is enforced by always deriving `userId`/`groupId` from the session — never from client input.

**Tech Stack:** Auth.js v5 (`next-auth`), bcryptjs, Drizzle/Neon, Next.js 16 Server Actions.

Re-platform Plan B of 3. Depends on Plan A (Drizzle foundation, merged). After this, auth + onboarding run fully on Neon. Pantry still reads Supabase until Plan C (intermediate split is expected; pantry simply shows empty until C).

**Note:** `AUTH_SECRET` and `DATABASE_URL` are already in `.env.local`.

---

## File Structure

**Created:**
- `src/auth.config.ts` — edge-safe Auth.js config (route protection, jwt/session callbacks)
- `src/auth.ts` — NextAuth instance with the Credentials provider
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js handlers
- `src/types/next-auth.d.ts` — session/jwt `id` augmentation

**Modified:**
- `package.json` — add `next-auth`, `bcryptjs`, `@types/bcryptjs`
- `.env.example` — add `DATABASE_URL`, `AUTH_SECRET`; note Supabase vars are being removed in Plan C
- `src/lib/groups.ts` — Drizzle `getActiveGroup(userId)`, `createGroupForUser`, `joinGroupForUser`
- `src/app/(auth)/actions.ts` — `signIn`/`signUp`/`signOut` via Auth.js + Drizzle
- `src/app/onboarding/actions.ts` — thin wrappers calling the groups lib
- `src/proxy.ts` — Auth.js middleware
- `src/app/(auth)/login/page.tsx`, `register/page.tsx` — `auth()` redirect guard
- `src/app/(protected)/layout.tsx`, `src/app/onboarding/layout.tsx` — `auth()` + `getActiveGroup(userId)`

**Deleted:**
- `src/lib/supabase/middleware.ts` (replaced by Auth.js proxy)
- `src/app/auth/confirm/route.ts` (no email confirmation)
- `src/lib/groups.test.ts` (Supabase-mock test; groups logic now verified by the Neon e2e script)

**Kept (until Plan C):** `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts` (pantry still imports them).

---

## Task 1: Dependencies + types + env example

- [ ] Install:
```bash
npm install next-auth@beta bcryptjs
npm install -D @types/bcryptjs
```

- [ ] Create `src/types/next-auth.d.ts`:
```ts
import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
```

- [ ] Update `.env.example` — add under the Supabase block:
```bash
# Neon Postgres (pooled connection string)
DATABASE_URL=

# Auth.js — generate with: node -e "console.log(require('crypto').randomBytes(33).toString('base64'))"
AUTH_SECRET=
```

- [ ] `npx tsc --noEmit` → exit 0. Commit:
```bash
git add package.json package-lock.json src/types/next-auth.d.ts .env.example
git commit -m "chore: add next-auth + bcryptjs deps and types"
```

---

## Task 2: Auth.js config + instance + route

- [ ] Create `src/auth.config.ts`:
```ts
import type { NextAuthConfig } from "next-auth";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/pantry",
  "/voting",
  "/history",
  "/settings",
  "/onboarding",
];

/** Edge-safe config: no DB, no providers — used by the proxy for route protection. */
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;
      const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
      if (isProtected && !isLoggedIn) return false; // → redirect to signIn page
      return true;
    },
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id;
      return session;
    },
  },
} satisfies NextAuthConfig;
```

- [ ] Create `src/auth.ts`:
```ts
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { authConfig } from "@/auth.config";
import { db } from "@/db";
import { users } from "@/db/schema";
import { signInSchema } from "@/lib/auth/validation";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
  ],
});
```

- [ ] Create `src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] `npx tsc --noEmit` → exit 0. Commit:
```bash
git add src/auth.config.ts src/auth.ts "src/app/api/auth/[...nextauth]/route.ts"
git commit -m "feat: add Auth.js (Credentials + JWT) config and route"
```

---

## Task 3: Groups DB logic (Drizzle)

- [ ] Replace `src/lib/groups.ts` with:
```ts
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { groupMembers, groups } from "@/db/schema";

export interface ActiveGroup {
  id: string;
  name: string;
}

/** The user's single active group (earliest membership), or null. */
export async function getActiveGroup(userId: string): Promise<ActiveGroup | null> {
  const rows = await db
    .select({ id: groups.id, name: groups.name })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .where(eq(groupMembers.userId, userId))
    .orderBy(asc(groupMembers.joinedAt))
    .limit(1);
  return rows[0] ?? null;
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars

function inviteCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

/** Create a group with the user as admin (transaction; retries on code collision). */
export async function createGroupForUser(
  userId: string,
  name: string,
): Promise<string> {
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
      return groupId;
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 4) continue;
      throw error;
    }
  }
  throw new Error("Could not generate a unique invite code");
}

/** Join a group by invite code. Returns the group id, or null if no match. */
export async function joinGroupForUser(
  userId: string,
  code: string,
): Promise<string | null> {
  const normalized = code.trim().toUpperCase();
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.inviteCode, normalized))
    .limit(1);
  if (!group) return null;

  await db
    .insert(groupMembers)
    .values({ groupId: group.id, userId, role: "member" })
    .onConflictDoNothing({ target: [groupMembers.groupId, groupMembers.userId] });

  return group.id;
}
```
(The `and` import is reserved for later; remove it if lint flags it as unused.)

- [ ] Delete the obsolete Supabase-mock test:
```bash
git rm src/lib/groups.test.ts
```

- [ ] `npx tsc --noEmit` → exit 0. Commit:
```bash
git add src/lib/groups.ts
git commit -m "feat: port group DB logic to Drizzle"
```

---

## Task 4: Auth server actions (Auth.js + Drizzle signup)

- [ ] Replace `src/app/(auth)/actions.ts` with:
```ts
"use server";

import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";

import { signIn as authSignIn, signOut as authSignOut } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { signInSchema, signUpSchema } from "@/lib/auth/validation";

export type AuthState = { error?: string; message?: string };

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await authSignIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Invalid email or password" };
    throw error; // re-throw the redirect
  }
  return {};
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
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);
  if (existing.length > 0) {
    return { error: "An account with this email already exists" };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db.insert(users).values({
    name: parsed.data.name,
    email: parsed.data.email,
    password: passwordHash,
  });

  try {
    await authSignIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/onboarding",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created — please log in." };
    }
    throw error;
  }
  return {};
}

export async function signOut(): Promise<void> {
  await authSignOut({ redirectTo: "/login" });
}
```

- [ ] `npx tsc --noEmit` → exit 0. Commit:
```bash
git add "src/app/(auth)/actions.ts"
git commit -m "feat: auth actions via Auth.js + Drizzle signup"
```

---

## Task 5: Onboarding actions (thin wrappers)

- [ ] Replace `src/app/onboarding/actions.ts` with:
```ts
"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { createGroupForUser, joinGroupForUser } from "@/lib/groups";

export type OnboardingState = { error?: string };

export async function createGroup(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Group name is required" };

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  try {
    await createGroupForUser(session.user.id, name);
  } catch {
    return { error: "Could not create group. Please try again." };
  }
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

  let groupId: string | null;
  try {
    groupId = await joinGroupForUser(session.user.id, code);
  } catch {
    return { error: "Could not join group. Please try again." };
  }
  if (!groupId) return { error: "No group found for that code" };

  redirect("/dashboard");
}
```

- [ ] `npx tsc --noEmit` → exit 0. Commit:
```bash
git add "src/app/onboarding/actions.ts"
git commit -m "feat: onboarding actions on Drizzle groups"
```

---

## Task 6: Rewire proxy, layouts, pages; delete obsolete files

- [ ] Replace `src/proxy.ts` with:
```ts
import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

export const { auth: proxy } = NextAuth(authConfig);

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] Replace `src/app/(auth)/login/page.tsx`:
```tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  return <LoginForm />;
}
```

- [ ] Replace `src/app/(auth)/register/page.tsx`:
```tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { RegisterForm } from "@/components/auth/register-form";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  return <RegisterForm />;
}
```

- [ ] Replace `src/app/(protected)/layout.tsx`:
```tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppShell } from "@/components/shell/app-shell";
import { getActiveGroup } from "@/lib/groups";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const group = await getActiveGroup(session.user.id);
  if (!group) redirect("/onboarding");

  return <AppShell groupName={group.name}>{children}</AppShell>;
}
```

- [ ] Replace `src/app/onboarding/layout.tsx`:
```tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getActiveGroup } from "@/lib/groups";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const group = await getActiveGroup(session.user.id);
  if (group) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
```

- [ ] Delete obsolete files:
```bash
git rm src/lib/supabase/middleware.ts "src/app/auth/confirm/route.ts"
```
(If `src/app/auth/confirm/` is now empty, also remove the directory.)

- [ ] Verify: `npx tsc --noEmit` (exit 0), `npm run lint` (clean), `npm test` (all pass — the auth/onboarding form tests mock the actions, so they still pass), and build:
```bash
NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder" npm run build
```
Expected: "Compiled successfully"; routes include `/login`, `/register`, `/onboarding`, `/api/auth/[...nextauth]`.

- [ ] Commit:
```bash
git add -A
git commit -m "feat: rewire app to Auth.js sessions; remove Supabase auth glue"
```

---

## Task 7: Headless end-to-end verification (against Neon)

- [ ] Create a throwaway script `scripts/verify-b.mjs` that exercises the Drizzle group logic + password hashing directly against Neon, then cleans up. Run it with `node --env-file=.env.local scripts/verify-b.mjs`:

```js
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = (text, params) => pool.query(text, params);

const stamp = Date.now();
const made = { users: [], groups: [] };

async function makeUser(label) {
  const hash = await bcrypt.hash("e2e-pass-12345", 10);
  const { rows } = await q(
    `insert into users (name, email, password) values ($1, $2, $3) returning id`,
    [`E2E ${label}`, `e2e-b-${label}-${stamp}@example.com`, hash],
  );
  made.users.push(rows[0].id);
  return rows[0].id;
}

try {
  // password hash round-trips
  const probe = await bcrypt.hash("secret123", 10);
  if (!(await bcrypt.compare("secret123", probe))) throw new Error("bcrypt round-trip failed");
  console.log("✓ bcrypt hash/compare works");

  const a = await makeUser("a");
  // createGroupForUser equivalent (transaction: group + admin membership)
  const code = "E2EB" + String(stamp).slice(-2);
  const client = await pool.connect();
  let groupId;
  try {
    await client.query("begin");
    const g = await client.query(
      `insert into groups (name, invite_code, created_by) values ($1,$2,$3) returning id`,
      ["E2E Flat B", code, a],
    );
    groupId = g.rows[0].id;
    await client.query(
      `insert into group_members (group_id, user_id, role) values ($1,$2,'admin')`,
      [groupId, a],
    );
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
  made.groups.push(groupId);
  console.log("✓ create group + admin membership (tx)");

  // getActiveGroup equivalent
  const active = await q(
    `select g.id, g.name from group_members m join groups g on g.id = m.group_id
     where m.user_id = $1 order by m.joined_at asc limit 1`,
    [a],
  );
  if (active.rows[0]?.name !== "E2E Flat B") throw new Error("getActiveGroup failed");
  console.log("✓ getActiveGroup returns the group");

  // joinGroupForUser equivalent (second user, idempotent)
  const b = await makeUser("b");
  const found = await q(`select id from groups where invite_code = $1`, [code]);
  if (!found.rows[0]) throw new Error("invite code lookup failed");
  await q(
    `insert into group_members (group_id, user_id, role) values ($1,$2,'member')
     on conflict (group_id, user_id) do nothing`,
    [found.rows[0].id, b],
  );
  await q(
    `insert into group_members (group_id, user_id, role) values ($1,$2,'member')
     on conflict (group_id, user_id) do nothing`,
    [found.rows[0].id, b],
  ); // second call is a no-op
  const bRole = await q(
    `select role from group_members where group_id = $1 and user_id = $2`,
    [found.rows[0].id, b],
  );
  if (bRole.rows[0]?.role !== "member") throw new Error("join failed");
  console.log("✓ join by code is idempotent; B is member");

  console.log("\n✅ PLAN B DB LOGIC VERIFIED");
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

- [ ] Run it → expect all ✓ and "PLAN B DB LOGIC VERIFIED", clean exit.
- [ ] Delete the script (`rm scripts/verify-b.mjs`); do not commit it.

---

## Self-Review
- **Coverage:** Supabase Auth fully replaced (Credentials + JWT); route protection via `authorized` callback; signup hashes with bcrypt and inserts into Drizzle `users`; group create/join are Drizzle transactions; `getActiveGroup` is Drizzle; obsolete Supabase auth glue + email-confirm route removed. ✓
- **Authorization (replaces RLS):** every mutation derives `userId` from `auth()` (never client input); `createGroupForUser`/`joinGroupForUser` take a trusted `userId`. The only data read without a membership check is the invite-code → group-id lookup in `joinGroupForUser`, which returns only the id (no leak), matching the old RPC behavior. ✓
- **Type consistency:** `getActiveGroup(userId)` signature updated and both layouts updated to pass `session.user.id`; `ActiveGroup` shape unchanged; `AuthState`/`OnboardingState` unchanged for the forms. ✓
- **Intermediate state:** pantry still uses Supabase and will show empty until Plan C — documented, not a regression. ✓
