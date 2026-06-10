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
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
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

// ---------- app tables ----------
export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
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
    lastGeneratedAt: timestamp("last_generated_at"),
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
