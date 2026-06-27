# Google OAuth Sign-In — Design

**Date:** 2026-06-11
**Status:** Approved (proceed)

## Goal

Let users sign in / sign up with Google on the login and register pages, alongside
the existing email+password (Credentials) flow. A Google user is persisted in our
`users` table so the rest of the app (groups, pantry, votes — all keyed off
`users.id`) works unchanged.

## Decisions (locked)

1. **Use `@auth/drizzle-adapter`.** Auth.js writes the user + `accounts` row on first
   Google login and handles account linking. The `accounts` table already exists and
   matches the adapter's default shape.
2. **Keep JWT session strategy.** Required because the Credentials provider cannot use
   database sessions. JWT + adapter is valid: the adapter persists user/account rows;
   sessions live in the JWT.
3. **Email account-linking on:** `allowDangerousEmailAccountLinking: true` on the
   Google provider, so signing in with Google links to an existing email+password
   account with the same (Google-verified) email instead of erroring. Accepted
   security tradeoff for this app.
4. **Re-add `sessions` and `verification_tokens` tables** (dropped in migration 0001)
   so the adapter has its full expected schema. They stay unused at runtime under JWT.

## Architecture

### Schema (`src/db/schema.ts`) + migration
Restore the two tables exactly as they were in migration `0000`:

```ts
export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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

`accounts` is already correct. Then `npm run db:generate` → migration `0002` recreates
the two tables; apply with `npm run db:migrate`.

### Env (`src/env.ts`, `.env.example`)
Add two optional vars (optional so the app still boots without them, like
`GEMINI_API_KEY`):

```ts
AUTH_GOOGLE_ID: z.string().min(1).optional(),
AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
```

Auth.js v5 auto-detects these names for the Google provider. Document both in
`.env.example` with the redirect URI note.

### Auth wiring (`src/auth.ts`)
Add the adapter + Google provider to the **node** config (not the edge
`auth.config.ts`, which must stay DB-free for the proxy):

```ts
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db),
  providers: [
    Credentials({ /* unchanged */ }),
    Google({ allowDangerousEmailAccountLinking: true }),
  ],
});
```

`session: { strategy: "jwt" }` is already set in `authConfig` and stays.

### Callbacks — no change needed
`auth.config.ts` already sets `token.id = user.id` (jwt) and
`session.user.id = token.id` (session). With the adapter, the Google `user` passed to
the jwt callback **is** our DB row, so `token.id` becomes our real user id
automatically. Verified compatible with both providers.

### Server action (`src/app/(auth)/actions.ts`)
```ts
export async function signInWithGoogle(): Promise<void> {
  await authSignIn("google", { redirectTo: "/dashboard" });
}
```
A brand-new Google user lands on `/dashboard`, which already redirects to
`/onboarding` when the user has no group — so no new routing logic.

### UI (`login-form.tsx`, `register-form.tsx`)
Add a "Continue with Google" button + an "or" divider above each existing form.
Extract the shared button into `src/components/auth/google-button.tsx` (one
responsibility, used by both forms) — a client component that calls
`signInWithGoogle` inside a `useTransition`.

## Data flow

1. User clicks **Continue with Google** → `signInWithGoogle()` server action.
2. Auth.js redirects to Google → user consents → Google redirects to
   `/api/auth/callback/google` (handled by the existing `[...nextauth]` route).
3. Adapter upserts the `users` row (+ `accounts` row); links by email if a matching
   account exists.
4. JWT issued with `token.id = users.id`; user redirected to `/dashboard`.
5. Dashboard checks group membership → `/onboarding` if none, else renders.

## Error handling

- **`OAuthAccountNotLinked`** is avoided by `allowDangerousEmailAccountLinking: true`.
  Any other OAuth error (user cancels, Google error) → Auth.js redirects back to
  `/login?error=...`; the login page reads `searchParams.error` and shows a friendly
  line ("Google sign-in failed. Please try again.").
- **Missing `AUTH_GOOGLE_ID/SECRET`:** the Google button is only rendered when a
  server-provided `googleEnabled` flag is true (page checks `env.AUTH_GOOGLE_ID`), so
  a misconfigured deploy hides the button rather than throwing on click.

## Testing

- **`google-button.test.tsx`** — renders "Continue with Google"; clicking calls
  `signInWithGoogle`.
- **login/register form tests** — the Google button shows when `googleEnabled`, hidden
  when not.
- **login page error display** — `?error=OAuthSignin` renders the friendly message.
- **OAuth round-trip is verified manually** (real Google login in dev) — the redirect
  handshake isn't unit-testable. Documented as a manual smoke step in the plan.
- Existing Credentials tests must continue to pass unchanged.

## Out of scope (YAGNI)

- No other providers (GitHub, etc.).
- No email magic-link / verification flow (the `verification_tokens` table is restored
  only to satisfy the adapter; no feature uses it).
- No account-management UI to unlink Google.
- No database session strategy.
