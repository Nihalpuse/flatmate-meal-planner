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

/** Lowercased, whitespace-collapsed, naive-singular form for matching. */
function normalizeIngredient(name: string): string {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (n.length <= 3) return n;
  if (n.endsWith("ies")) return `${n.slice(0, -3)}y`; // chillies -> chilly
  if (n.endsWith("oes")) return n.slice(0, -2); // tomatoes -> tomato
  if (n.endsWith("s") && !n.endsWith("ss")) return n.slice(0, -1); // eggs -> egg
  return n;
}

/** Required ingredients not present (plural/case-insensitive) in the available list. */
export function missingIngredients(required: string[], available: string[]): string[] {
  const have = new Set(available.map(normalizeIngredient));
  return required.filter((r) => !have.has(normalizeIngredient(r)));
}

/** YYYY-MM-DD for the given instant in the given IANA timezone. */
export function toDateString(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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
  timezone: string,
): Promise<{ lunch: MealSession; dinner: MealSession }> {
  const date = toDateString(new Date(), timezone);
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
