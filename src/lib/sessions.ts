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
    .select({ name: finalizedMeals.mealName })
    .from(finalizedMeals)
    .innerJoin(mealSessions, eq(finalizedMeals.sessionId, mealSessions.id))
    .where(eq(mealSessions.groupId, groupId))
    .orderBy(desc(finalizedMeals.finalizedAt))
    .limit(limit);
  return rows.map((r) => r.name);
}
