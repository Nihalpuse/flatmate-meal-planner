"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import { mealSessions, mealSuggestions } from "@/db/schema";
import { generateMealSuggestions } from "@/lib/ai/gemini";
import { getActiveGroup } from "@/lib/groups";
import {
  getAvailableIngredientNames,
  getRecentMealNames,
} from "@/lib/sessions";

export type GenerateState = { error?: string };

export async function generateSuggestions(sessionId: string): Promise<GenerateState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const group = await getActiveGroup(session.user.id);
  if (!group) redirect("/onboarding");

  // Authorize: the session must belong to the user's group.
  const [mealSession] = await db
    .select()
    .from(mealSessions)
    .where(and(eq(mealSessions.id, sessionId), eq(mealSessions.groupId, group.id)))
    .limit(1);
  if (!mealSession) return { error: "Session not found" };

  const [available, recent] = await Promise.all([
    getAvailableIngredientNames(group.id),
    getRecentMealNames(group.id, 10),
  ]);

  let suggestions;
  try {
    suggestions = await generateMealSuggestions({
      availableIngredients: available,
      recentMeals: recent,
      mealType: mealSession.mealType,
    });
  } catch {
    return { error: "Could not reach the AI. Please try again." };
  }

  await db.delete(mealSuggestions).where(eq(mealSuggestions.sessionId, sessionId));
  if (suggestions.length > 0) {
    await db.insert(mealSuggestions).values(
      suggestions.map((s) => ({
        sessionId,
        mealName: s.mealName,
        requiredIngredients: s.requiredIngredients,
        aiGenerated: true,
      })),
    );
  }

  revalidatePath("/dashboard");
  return {};
}
