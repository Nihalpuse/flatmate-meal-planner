"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";

import { auth } from "@/auth";
import { parseDish } from "@/lib/ai/gemini";
import {
  DISHES_TAG,
  findDishByName,
  searchDishesCached,
  upsertAiDish,
  type DishHit,
} from "@/lib/dishes";
import { getGroupContext } from "@/lib/groups";
import { checkRateLimit } from "@/lib/rate-limit";
import { addCatalogSuggestion, removeSuggestion } from "@/lib/suggestions";

export type SuggestionActionState = { error?: string };

export async function searchDishesAction(query: string): Promise<DishHit[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const trimmed = query.trim();
  if (!trimmed) return [];
  return searchDishesCached(trimmed);
}

export async function addSuggestionFromCatalog(
  sessionId: string,
  dishId: string,
): Promise<SuggestionActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const group = await getGroupContext(session.user.id);
  if (!group) redirect("/onboarding");

  const error = await addCatalogSuggestion(session.user.id, group.id, sessionId, dishId);
  if (error) return { error };
  revalidatePath("/dashboard");
  return {};
}

export async function addSuggestionWithAI(
  sessionId: string,
  name: string,
): Promise<SuggestionActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const group = await getGroupContext(session.user.id);
  if (!group) redirect("/onboarding");

  const trimmed = name.trim();
  if (!trimmed) return { error: "Type a dish name first." };

  // The client only offers the AI fallback when the search returned no exact
  // match, but that search is capped at 8 alphabetically-ordered rows — a dish
  // that exists but ranks lower never shows up. Check the catalog properly
  // before spending an AI call (and the caller's rate-limit budget) on a dish
  // we already have.
  const known = await findDishByName(trimmed);
  if (known) {
    const error = await addCatalogSuggestion(
      session.user.id,
      group.id,
      sessionId,
      known.id,
    );
    if (error) return { error };
    revalidatePath("/dashboard");
    return {};
  }

  if (!(await checkRateLimit(`dish-ai:${session.user.id}`, 20, 60_000))) {
    return { error: "Too many attempts. Try again in a minute." };
  }

  let ingredients: string[];
  try {
    ingredients = await parseDish(trimmed);
  } catch {
    return { error: "Could not reach the AI. Please try again." };
  }

  const dish = await upsertAiDish(trimmed, ingredients);
  const error = await addCatalogSuggestion(session.user.id, group.id, sessionId, dish.id);
  if (error) return { error };
  // New dish in the catalog — expire the cached search results now, so the user
  // who added it sees it in the next search rather than a stale result set.
  updateTag(DISHES_TAG);
  revalidatePath("/dashboard");
  return {};
}

export async function removeSuggestionFromSession(
  sessionId: string,
  suggestionId: string,
): Promise<SuggestionActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const group = await getGroupContext(session.user.id);
  if (!group) redirect("/onboarding");

  const error = await removeSuggestion(
    session.user.id,
    group.id,
    group.role === "admin",
    sessionId,
    suggestionId,
  );
  if (error) return { error };
  revalidatePath("/dashboard");
  return {};
}
