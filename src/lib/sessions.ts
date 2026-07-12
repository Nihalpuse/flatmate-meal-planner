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
import { toDateString } from "@/lib/meal-utils";

/** Both of a group's sessions for a date, in one query. */
function selectSessions(groupId: string, sessionDate: string) {
  return db
    .select()
    .from(mealSessions)
    .where(
      and(
        eq(mealSessions.groupId, groupId),
        eq(mealSessions.sessionDate, sessionDate),
      ),
    );
}

/**
 * Today's lunch and dinner sessions, creating them on the first render of the day.
 *
 * Read-first: after that first render both rows exist for the rest of the day, so
 * the common path is a single SELECT and no write at all. Only the rows that are
 * actually missing get inserted; the unique index on
 * (group_id, session_date, meal_type) makes a concurrent first render harmless,
 * and the re-read picks up whichever writer won.
 */
export async function getOrCreateTodaySessions(
  groupId: string,
  timezone: string,
): Promise<{ lunch: MealSession; dinner: MealSession }> {
  const date = toDateString(new Date(), timezone);

  const existing = await selectSessions(groupId, date);
  const found = (type: "lunch" | "dinner") =>
    existing.find((s) => s.mealType === type);
  if (found("lunch") && found("dinner")) {
    return { lunch: found("lunch")!, dinner: found("dinner")! };
  }

  const missing = (["lunch", "dinner"] as const)
    .filter((type) => !found(type))
    .map((mealType) => ({ groupId, sessionDate: date, mealType }));
  await db.insert(mealSessions).values(missing).onConflictDoNothing();

  const rows = await selectSessions(groupId, date);
  return {
    lunch: rows.find((s) => s.mealType === "lunch")!,
    dinner: rows.find((s) => s.mealType === "dinner")!,
  };
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
    .select({ name: finalizedMeals.mealName })
    .from(finalizedMeals)
    .innerJoin(mealSessions, eq(finalizedMeals.sessionId, mealSessions.id))
    .where(eq(mealSessions.groupId, groupId))
    .orderBy(desc(finalizedMeals.finalizedAt))
    .limit(limit);
  return rows.map((r) => r.name);
}
