# Re-platform A — Drizzle + Neon Foundation

**Goal:** Stand up Drizzle ORM against the Neon Postgres database — schema in code, migrations applied via CLI, a typed db client — without removing Supabase yet (the app keeps working).

**Architecture:** All tables (Auth.js's `users`/`accounts`/`sessions`/`verification_tokens` + the app tables) are declared in `src/db/schema.ts`. `drizzle-kit` generates SQL migrations into `drizzle/` and applies them to Neon using `DATABASE_URL`. A `src/db/index.ts` exports a Drizzle client over the Neon serverless driver (WebSocket Pool, so transactions work in Plan B). This is infra: verified by applying the migration to the real database and querying it back, not by unit tests.

**Tech Stack:** Drizzle ORM + drizzle-kit, @neondatabase/serverless (Pool over `ws`), Neon Postgres 18.

Re-platform Plan A of 3 (A: Drizzle foundation → B: Auth.js + groups → C: Pantry on Drizzle). Plan 1 UI is untouched; Supabase stays in place until Plans B/C remove it.

---

## File Structure

**Created:**
- `src/db/schema.ts` — all tables + enums + inferred type aliases
- `src/db/index.ts` — Drizzle client (Neon Pool)
- `drizzle.config.ts` — drizzle-kit config (loads `.env.local`)
- `drizzle/` — generated migration SQL (by drizzle-kit)

**Modified:**
- `package.json` — deps + `db:generate` / `db:migrate` / `db:studio` scripts
- `.gitignore` — keep migrations tracked; nothing to ignore (drizzle meta is committed)

---

## Schema decisions
- **Auth.js tables** follow the official `@auth/drizzle-adapter` Postgres shape (`users` with text UUID id, `accounts`, `sessions`, `verification_tokens`), plus a nullable `password` column on `users` for the Credentials provider (bcrypt hash; OAuth users leave it null). `profiles` is gone — merged into `users`.
- **App tables** mirror the existing Supabase schema, with `created_by` / `user_id` / `finalized_by` now `text` FKs to `users.id`. App row ids stay `uuid defaultRandom()`.
- **`quantity`** uses `doublePrecision` (maps to a JS `number`, unlike `numeric` which is a string).
- **Case-insensitive ingredient uniqueness** is a `uniqueIndex` on `(group_id, lower(name))` (the lesson from the Supabase migration — no expression in a table constraint).
- **`meal_history`** is NOT a DB view here; it'll be a Drizzle join query in the History plan.
- **No RLS.** Authorization moves to app code in Plan B (a `requireGroup()` helper scoping every query).

---

## Task 1: Install dependencies

- [ ] Install:
```bash
npm install drizzle-orm
npm install -D drizzle-kit dotenv
npm install ws
npm install -D @types/ws
```
(@neondatabase/serverless is already installed.)

- [ ] Add to `package.json` scripts:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio"
```

---

## Task 2: Drizzle schema

- [ ] Create `src/db/schema.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------- enums ----------
export const memberRole = pgEnum("member_role", ["admin", "member"]);
export const sessionStatus = pgEnum("session_status", [
  "open",
  "voting",
  "finalized",
  "cancelled",
]);
export const mealType = pgEnum("meal_type", ["lunch", "dinner"]);

// ---------- Auth.js tables ----------
export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  password: text("password"), // bcrypt hash for Credentials users (null for OAuth)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

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

// ---------- app tables ----------
export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("group_members_group_user_idx").on(t.groupId, t.userId)],
);

export const ingredients = pgTable(
  "ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    quantity: doublePrecision("quantity"),
    unit: text("unit"),
    available: boolean("available").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ingredients_group_lower_name_idx").on(
      t.groupId,
      sql`lower(${t.name})`,
    ),
  ],
);

export const mealSessions = pgTable(
  "meal_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    sessionDate: date("session_date").notNull(),
    mealType: mealType("meal_type").notNull(),
    status: sessionStatus("status").notNull().default("open"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("meal_sessions_group_date_type_idx").on(
      t.groupId,
      t.sessionDate,
      t.mealType,
    ),
  ],
);

export const mealSuggestions = pgTable("meal_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => mealSessions.id, { onDelete: "cascade" }),
  mealName: text("meal_name").notNull(),
  aiGenerated: boolean("ai_generated").notNull().default(true),
  requiredIngredients: jsonb("required_ingredients")
    .$type<string[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const votes = pgTable(
  "votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => mealSessions.id, { onDelete: "cascade" }),
    suggestionId: uuid("suggestion_id")
      .notNull()
      .references(() => mealSuggestions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("votes_session_user_idx").on(t.sessionId, t.userId)],
);

export const finalizedMeals = pgTable("finalized_meals", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .unique()
    .references(() => mealSessions.id, { onDelete: "cascade" }),
  suggestionId: uuid("suggestion_id").references(() => mealSuggestions.id),
  mealName: text("meal_name").notNull(),
  finalizedBy: text("finalized_by")
    .notNull()
    .references(() => users.id),
  finalizedAt: timestamp("finalized_at").notNull().defaultNow(),
});

// ---------- inferred types ----------
export type User = typeof users.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type Ingredient = typeof ingredients.$inferSelect;
export type MealSession = typeof mealSessions.$inferSelect;
export type MealSuggestion = typeof mealSuggestions.$inferSelect;
export type Vote = typeof votes.$inferSelect;
export type FinalizedMeal = typeof finalizedMeals.$inferSelect;
```

---

## Task 3: drizzle.config.ts + db client

- [ ] Create `drizzle.config.ts`:

```ts
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] Create `src/db/index.ts`:

```ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

// Node needs an explicit WebSocket implementation for the Neon Pool.
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

export const db = drizzle(pool, { schema });
```

---

## Task 4: Generate + apply migration to Neon

- [ ] Generate the migration SQL:
```bash
npm run db:generate
```
Expected: a `drizzle/0000_*.sql` file is created with all CREATE TABLE / TYPE / INDEX statements.

- [ ] Apply it to Neon:
```bash
npm run db:migrate
```
Expected: applies cleanly; no errors.

- [ ] Verify against the live database — run a quick node check (Node 22 loads `.env.local`):
```bash
node --env-file=.env.local -e "import('@neondatabase/serverless').then(async ({neon})=>{const sql=neon(process.env.DATABASE_URL);const t=await sql`select table_name from information_schema.tables where table_schema='public' order by table_name`;console.log(t.map(r=>r.table_name).join(', '))})"
```
Expected: lists `accounts, finalized_meals, group_members, groups, ingredients, meal_sessions, meal_suggestions, sessions, users, verification_tokens, votes` (plus drizzle's `__drizzle_migrations`).

---

## Task 5: Verify the app still builds + commit

- [ ] `npx tsc --noEmit` → exit 0 (new db files type-check; Supabase code untouched).
- [ ] `npm test` → all existing tests still pass (nothing removed yet).
- [ ] `npm run lint` → clean.
- [ ] `NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder" npm run build` → "Compiled successfully".
- [ ] Commit the schema, config, client, generated migration, and package changes.

---

## Self-Review
- **Coverage:** every Supabase table is represented in Drizzle; Auth.js tables added; enums ported; the `lower(name)` uniqueness is an index (not a constraint); `quantity` is a JS number. ✓
- **Type consistency:** inferred type aliases exported for use in Plans B/C; the `Ingredient` alias will replace `@/types/database`'s in the pantry port. ✓
- **No premature removal:** Supabase deps/code remain so the app keeps building until Plans B/C migrate auth and pantry. ✓
