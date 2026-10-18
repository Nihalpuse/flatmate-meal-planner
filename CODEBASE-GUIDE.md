# FlatMate Meal Planner — Codebase Guide

Simple notes on what this app is, what it uses, and how it works.

---

## 1. What the app does

- Problem: flatmates waste 15–20 min every day deciding what to cook.
- Solution: one shared app where the flat votes on meals.
- Goal: decision done in under 2 minutes.
- App name shown to users: **"Aaj Kya Banega?"**

**The daily loop:**

```
Login → Join/Create a flat → Add ingredients → AI suggests 5 dishes
      → Everyone votes → Admin finalizes → Saved to history
```

---

## 2. Tech Stack

| Layer | What is used |
|---|---|
| Framework | Next.js 16.2.7 (App Router) |
| UI library | React 19.2.4 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Components | Base UI + `cva` (shadcn style) |
| Icons | `lucide-react` |
| Animation | `motion` |
| Toasts | `sonner` |
| Dark mode | `next-themes` |
| Database | Neon Postgres (serverless) |
| ORM | Drizzle ORM + drizzle-kit |
| Auth | Auth.js v5 (NextAuth beta) |
| Passwords | `bcryptjs` |
| AI | Google Gemini (`gemini-2.5-flash`) |
| Cache + rate limit | Upstash Redis (optional) |
| Email | Resend (optional) |
| Validation | Zod v4 |
| Tests | Vitest + Testing Library + PGlite |
| Deploy | Vercel |

**No REST API layer.** All backend work happens in **Server Actions**.

---

## 3. Folder Map

```
src/
├── app/                  → pages + server actions (Next.js routes)
│   ├── (auth)/           → login, register
│   ├── (protected)/      → dashboard, pantry, history, settings
│   ├── onboarding/       → create or join a flat
│   ├── verify-email/     → "check your inbox" screen
│   ├── verify/           → lands the emailed link (public)
│   └── page.tsx          → landing page
├── components/           → all React UI
│   ├── ui/               → base pieces (Button, GlassCard, Kicker...)
│   ├── shell/            → app frame (top nav, bottom tabs)
│   ├── landing/          → marketing page sections
│   └── dashboard|pantry|history|settings|auth|onboarding/
├── lib/                  → business logic + DB queries (NO Next.js imports)
│   ├── ai/               → prompts + response parsing
│   ├── pantry/           → merge, filter, validation helpers
│   └── auth/             → login/signup input rules
├── db/                   → schema.ts + db connection
├── server/               → server-only helpers (client IP)
├── auth.ts               → full Auth.js setup (has DB access)
├── auth.config.ts        → edge-safe Auth.js config (no DB)
├── proxy.ts              → route protection (Next 16's middleware)
└── env.ts                → env vars validated by Zod
```

---

## 4. The 3-Layer Rule (important)

This is the main architectural idea in the project.

```
components/   →  UI only. Calls server actions.
     ↓
app/*/actions →  Checks login + permission, then calls lib/. Handles caching.
     ↓
lib/          →  Pure business logic + Drizzle queries. Framework-free.
     ↓
db/           →  Drizzle schema + Neon connection
```

- `lib/` is **not allowed to import anything from `next`**.
- Why? So the logic can move to a separate API service later without a rewrite.
- This rule is enforced by an actual test: [architecture.test.ts](src/lib/architecture.test.ts).
- Framework things (caching, `revalidatePath`) live in `app/`, e.g. [dish-cache.ts](src/app/(protected)/dashboard/dish-cache.ts).
- `react`'s `cache()` is allowed — it does nothing outside a request.

---

## 5. Database Tables

Source of truth: [schema.ts](src/db/schema.ts). Migrations sit in [drizzle/](drizzle/) (5 so far).

**Auth tables (from Auth.js):**

| Table | Purpose |
|---|---|
| `users` | name, email, bcrypt password, `token_version` |
| `accounts` | linked Google accounts |
| `sessions` | present but unused (JWT strategy is used) |
| `verification_tokens` | reused for email verification links |

**App tables:**

| Table | Purpose |
|---|---|
| `groups` | the flat — name, invite code, timezone |
| `group_members` | who is in the flat + role (admin/member) |
| `ingredients` | the pantry (name, qty, unit, available flag) |
| `meal_sessions` | one row per flat per day per meal (lunch/dinner) |
| `dishes` | global dish catalog (seed or AI-created) |
| `meal_suggestions` | the 5 options for one session |
| `votes` | one row per user per session |
| `finalized_meals` | the winner — this IS the history |

**Key constraints:**

- `unique(group_id, session_date, meal_type)` → only 2 sessions per day, ever.
- `unique(session_id, user_id)` → one vote per person, upsert to change it.
- `unique(group_id, lower(name))` on ingredients → no duplicate "Onion"/"onion".
- `unique(lower(name))` on dishes → catalog stays clean.
- Deleting a group cascades and removes everything under it.

**Enums:** `member_role`, `session_status` (open/voting/finalized/cancelled), `meal_type`, `dish_source`.

---

## 6. How Authentication Works

This is the most detailed part of the codebase.

### Login methods
- Email + password (bcrypt, cost 10)
- Google OAuth (button only shows if Google env vars are set)

### Sessions
- **JWT strategy**, not DB sessions. Credentials login forces this.
- Session lasts **7 days** (not the default 30) — a stolen cookie is usable for less time.

### Two Auth.js configs — why?
| File | Runs where | Has DB? |
|---|---|---|
| [auth.config.ts](src/auth.config.ts) | Edge (the proxy) | No |
| [auth.ts](src/auth.ts) | Server (pages, actions) | Yes |

- The proxy only checks "does this token decrypt?" — a coarse filter.
- The real check happens in `auth()` on every page and action.

### Revoking a session (the clever bit)
- A JWT can't normally be cancelled — it's self-contained.
- Fix: `users.token_version` is stamped into every JWT.
- On each request the stamped version is compared to the DB value.
- Mismatch → token is dropped, cookie cleared.
- "Sign out everywhere" just bumps this number. See [auth-state.ts](src/lib/auth-state.ts).
- Redis caches this check (5 min TTL) so it's one Redis hit, not a DB query.
- Writes go **through** the cache, so revoking takes effect instantly.

### Email verification
- Random 32 bytes sent in the link; only its **SHA-256 hash** is stored.
- So a leaked DB dump gives no working links.
- Single use, expires in 24 hours, one live token per address.
- [/verify](src/app/verify/page.tsx) is **public** on purpose — people open the email on another device.
- Unverified users get bounced to `/verify-email` and **cannot create or join a flat**.

### Two security fixes baked in
1. **No `allowDangerousEmailAccountLinking`** on Google. Otherwise: attacker registers `victim@gmail.com` with their own password → real owner signs in with Google → accounts merge → attacker owns the account.
2. **Google's `email_verified` claim is checked.** Unverified Google addresses are refused.

---

## 7. Route Protection

- [proxy.ts](src/proxy.ts) = Next 16's renamed middleware. Must export a function called `proxy`.
- Protected prefixes: `/dashboard`, `/pantry`, `/history`, `/settings`, `/onboarding`, `/verify-email`.
- The real gate is [(protected)/layout.tsx](src/app/(protected)/layout.tsx), which checks in this order:
  1. Logged in? No → `/login`
  2. Email confirmed? No → `/verify-email`
  3. In a group? No → `/onboarding`
- **Server Actions re-check too.** A layout redirect does not protect an action — an action is a callable endpoint on its own. See [onboarding/actions.ts](src/app/onboarding/actions.ts).

---

## 8. Feature Walkthrough

### Groups
- One user = one group (v1 limit).
- Invite code: 6 chars from an alphabet with **no confusing characters** (no O/0, I/1).
- Retries up to 5 times if a code collides.
- Admin can: rotate the code, remove members, promote members.
- Leaving: last member deletes the whole group; a sole admin must promote someone first.

### Pantry
- Add / edit / delete ingredients; toggle available.
- **Availability is presence-based, not quantity-based.** Low stock does not block a dish.
- **Natural language input:** type "bought 2kg potato and a dozen eggs" → Gemini parses it → you review before saving.
- Merge rule: same unit → quantities are **added**; different unit → new value **replaces**. See [merge.ts](src/lib/pantry/merge.ts).

### Meal Sessions
- Two per day: lunch + dinner, voted separately.
- Created lazily on the first page load of the day ("read-first").
- The date is computed in the **group's timezone** (default `Asia/Kolkata`).
- Concurrent first loads are safe — the unique index absorbs the race.

### AI Suggestions
- Sends: available ingredients + last 10 finalized meals + lunch/dinner.
- Asks for 5 simple, budget-friendly Indian dishes, no repeats.
- Uses Gemini's **structured JSON output** (response schema), 15 second timeout.
- Output is still re-validated with Zod — never trusted blindly. See [parse.ts](src/lib/ai/parse.ts).
- **Cooldown: 30 seconds** between regenerations, enforced by a guarded SQL `UPDATE` (the DB row is the rate limiter).
- Regenerate is **locked once anyone votes**.

### Manual dish adding
- Search the shared dish catalog (debounced 250ms, cached 1 hour).
- Not found? "Search with AI" → Gemini lists its ingredients → dish saved to the catalog for everyone.
- Exact-match check runs first so a known dish never wastes an AI call.
- Max 15 suggestions per session, no duplicates.

### Voting
- Tap to vote, tap again to unvote, tap another to move your vote.
- UI uses `useOptimistic` — it updates instantly, then syncs.
- Page **polls every 8 seconds** (only when the tab is visible) so flatmates' votes appear live.
- Polling stops once both meals are finalized.

### Finalizing
- Admin only.
- Winner = most votes; tie broken by **earliest suggested**.
- Everything happens inside a transaction with `SELECT ... FOR UPDATE`, so the count can't change mid-tally.

### Missing ingredients / grocery list
- Compares the dish's required list against the pantry.
- Matching is smart about plurals: `tomatoes → tomato`, `eggs → egg`, `chillies → chilly`.
- Missing items show as a shopping list with a **Copy** button.

### History
- Just reads `finalized_meals` — no separate history table, so it can never drift.
- Grouped by date, last 60 entries.

---

## 9. Concurrency — how races are avoided

The app is used by 3–4 people on their phones at the same time, so this matters.

| Risk | Fix |
|---|---|
| Two people load the app first thing in the morning | Unique index + `onConflictDoNothing` |
| Regenerate deletes suggestions while someone votes | Row lock + status flipped to `voting` **before** the vote lands |
| Vote count changes while admin finalizes | Tally + status flip inside one locked transaction |
| Two people spam Generate | Guarded `UPDATE` — only one wins |
| Duplicate invite code | Catch unique violation, retry |

---

## 10. Rate Limiting

- Two layers: **Upstash Redis** (shared) or **in-memory** (fallback).
- Redis missing or down → falls back to memory. Degraded beats broken.
- Without Redis on a multi-instance deploy, limits are bypassable — that's why it's recommended in production.

| Action | Limit |
|---|---|
| Sign in (per email) | 5 / min |
| Sign in (per IP) | 20 / min |
| Sign up (per email) | 3 / min |
| Sign up (per IP) | 10 / hour |
| Join group | 10 / min |
| Resend verification (per user) | 3 / hour |
| Resend verification (per IP) | 10 / hour |
| AI purchase parse | 15 / min |
| AI dish lookup | 20 / min |

**Why two keys?** Per-email stops brute-forcing one account. Per-IP stops credential stuffing (a different email each try = a fresh bucket).

---

## 11. UI & Design

- **Mobile first.** Bottom tab bar on phone, top nav on desktop.
- Theme: **"Honey Butter"** — warm cream light mode, warm espresso dark mode.
- Fonts: Plus Jakarta Sans (body) + Space Mono (mono).
- Signature component: `GlassCard` — frosted glass with a solid fallback where `backdrop-filter` isn't supported.
- Custom small components: `Kicker`, `CountChip`, `BackgroundField` (animated blobs).
- Loading skeletons via `loading.tsx` per route.
- Colors are CSS variables in [globals.css](src/app/globals.css), wired into Tailwind v4 via `@theme inline`.

**Prefetch trick:** Pantry and History are fully prefetched so they open instantly with no skeleton. The Dashboard is **deliberately not** — its vote counts are live, and stale votes would mean cooking the wrong dinner. See [nav.ts](src/lib/nav.ts).

---

## 12. Environment Variables

**Required:**
- `DATABASE_URL` — Neon Postgres
- `AUTH_SECRET` — JWT signing key
- `NEXT_PUBLIC_APP_URL`

**Optional (feature toggles):**
- `GEMINI_API_KEY` — AI features
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — shows the Google button
- `UPSTASH_REDIS_REST_URL` / `_TOKEN` — shared rate limits + auth cache
- `RESEND_API_KEY` / `EMAIL_FROM` — real emails (dev logs to console instead; **production refuses this fallback**)

All validated by Zod at startup in [env.ts](src/env.ts) — it fails fast with a clear message instead of crashing deep in the app later.

---

## 13. Testing & CI

- **52 test files**, 10 of them integration tests.
- Runner: Vitest, jsdom environment.
- Integration tests run against **PGlite** — real Postgres compiled to WASM, in memory, with the real migrations applied. No Docker needed. See [test/db.ts](src/test/db.ts).
- Component tests use Testing Library.
- One test guards architecture (the `lib/` rule).

**CI** ([ci.yml](.github/workflows/ci.yml)) runs on every push to main and every PR:

```
npm ci → lint → typecheck → test → build
```

---

## 14. Commands

```bash
npm run dev          # start dev server
npm run build        # production build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # run all tests once
npm run test:watch   # watch mode

npm run db:generate  # create a migration from schema.ts
npm run db:migrate   # apply migrations
npm run db:studio    # visual DB browser
```

---

## 15. Quick "where do I look?" index

| I want to change... | Go to |
|---|---|
| Database tables | [src/db/schema.ts](src/db/schema.ts) |
| Login / signup rules | [src/lib/auth/validation.ts](src/lib/auth/validation.ts) |
| Session revoking | [src/lib/auth-state.ts](src/lib/auth-state.ts) |
| AI prompts | [src/lib/ai/prompt.ts](src/lib/ai/prompt.ts) |
| AI API call | [src/lib/ai/gemini.ts](src/lib/ai/gemini.ts) |
| Voting / finalizing logic | [src/lib/votes.ts](src/lib/votes.ts) |
| Suggestion + cooldown logic | [src/lib/suggestions.ts](src/lib/suggestions.ts) |
| Group / invite logic | [src/lib/groups.ts](src/lib/groups.ts) |
| Rate limits | [src/lib/rate-limit.ts](src/lib/rate-limit.ts) |
| Dashboard UI | [src/components/dashboard/dashboard-view.tsx](src/components/dashboard/dashboard-view.tsx) |
| Colors / theme | [src/app/globals.css](src/app/globals.css) |
| Nav tabs | [src/lib/nav.ts](src/lib/nav.ts) |

---

## 16. Things to remember before editing

- ⚠️ **Next.js 16 has breaking changes.** Read `node_modules/next/dist/docs/` before writing code — see [AGENTS.md](AGENTS.md).
- Never import `next` inside `lib/` — a test will fail.
- Always re-check auth inside a Server Action, not just in the page.
- Edit `schema.ts`, then run `db:generate` — never hand-write a migration.
- Treat Redis as a cache only. It must be safe to lose.
- Every AI response must be re-validated with Zod.
- Server actions call `revalidatePath` after a write, or the UI shows stale data.
