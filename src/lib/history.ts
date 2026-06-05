import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { finalizedMeals, mealSessions } from "@/db/schema";

export interface HistoryEntry {
  mealName: string;
  date: string;
  mealType: "lunch" | "dinner";
}

export interface DayHistory {
  date: string;
  meals: HistoryEntry[];
}

/** Groups finalized meals by date, preserving the input order. */
export function groupHistoryByDate(entries: HistoryEntry[]): DayHistory[] {
  const days: DayHistory[] = [];
  const byDate = new Map<string, DayHistory>();
  for (const entry of entries) {
    let day = byDate.get(entry.date);
    if (!day) {
      day = { date: entry.date, meals: [] };
      byDate.set(entry.date, day);
      days.push(day);
    }
    day.meals.push(entry);
  }
  return days;
}

export async function getMealHistory(
  groupId: string,
  limit = 60,
): Promise<HistoryEntry[]> {
  const rows = await db
    .select({
      mealName: finalizedMeals.mealName,
      date: mealSessions.sessionDate,
      mealType: mealSessions.mealType,
    })
    .from(finalizedMeals)
    .innerJoin(mealSessions, eq(finalizedMeals.sessionId, mealSessions.id))
    .where(eq(mealSessions.groupId, groupId))
    .orderBy(desc(mealSessions.sessionDate), asc(mealSessions.mealType))
    .limit(limit);
  return rows;
}
