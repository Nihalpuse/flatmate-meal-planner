"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { generateMealSuggestions } from "@/lib/ai/gemini";
import { getActiveGroup } from "@/lib/groups";
import { claimGeneration, replaceSuggestions } from "@/lib/suggestions";
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

  // Claim first: enforces group ownership, "open" status, and the cooldown
  // before we spend an AI call.
  const claim = await claimGeneration(sessionId, group.id);
  if ("error" in claim) return { error: claim.error };

  const [available, recent] = await Promise.all([
    getAvailableIngredientNames(group.id),
    getRecentMealNames(group.id, 10),
  ]);

  let suggestions;
  try {
    suggestions = await generateMealSuggestions({
      availableIngredients: available,
      recentMeals: recent,
      mealType: claim.session.mealType,
    });
  } catch {
    return { error: "Could not reach the AI. Please try again." };
  }

  const replaceError = await replaceSuggestions(sessionId, suggestions);
  if (replaceError) return { error: replaceError };

  revalidatePath("/dashboard");
  return {};
}
