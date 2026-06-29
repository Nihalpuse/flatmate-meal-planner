import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { dishes, mealSessions, mealSuggestions, type MealSession } from "@/db/schema";
import type { Suggestion } from "@/lib/ai/parse";

export const GENERATE_COOLDOWN_SECONDS = 30;

export type ClaimResult = { error: string } | { session: MealSession };

/**
 * Atomically claim the right to generate for a session: only while "open" and
 * at most once per cooldown window. The guarded UPDATE is the rate limiter —
 * concurrent claims race on the same row and exactly one wins.
 */
export async function claimGeneration(
  sessionId: string,
  groupId: string,
): Promise<ClaimResult> {
  const claimed = await db
    .update(mealSessions)
    .set({ lastGeneratedAt: sql`now()` })
    .where(
      and(
        eq(mealSessions.id, sessionId),
        eq(mealSessions.groupId, groupId),
        eq(mealSessions.status, "open"),
        sql`(${mealSessions.lastGeneratedAt} is null or ${mealSessions.lastGeneratedAt} < now() - interval '${sql.raw(String(GENERATE_COOLDOWN_SECONDS))} seconds')`,
      ),
    )
    .returning();
  if (claimed.length > 0) return { session: claimed[0] };

  const [session] = await db
    .select()
    .from(mealSessions)
    .where(and(eq(mealSessions.id, sessionId), eq(mealSessions.groupId, groupId)))
    .limit(1);
  if (!session) return { error: "Session not found" };
  if (session.status !== "open") {
    return { error: "Voting has started — regenerate is locked." };
  }
  return { error: "Please wait a moment before regenerating." };
}

/** Replace a session's suggestions, only while it is still open. Error string or null. */
export async function replaceSuggestions(
  sessionId: string,
  items: Suggestion[],
): Promise<string | null> {
  return db.transaction(async (tx) => {
    // Row lock + status re-check: a vote flipping the session to "voting"
    // can never interleave with this delete, so votes are never cascaded away.
    const [session] = await tx
      .select()
      .from(mealSessions)
      .where(eq(mealSessions.id, sessionId))
      .limit(1)
      .for("update");
    if (!session || session.status !== "open") {
      return "Voting has started — regenerate is locked.";
    }
    await tx
      .delete(mealSuggestions)
      .where(
        and(
          eq(mealSuggestions.sessionId, sessionId),
          eq(mealSuggestions.aiGenerated, true),
        ),
      );
    if (items.length > 0) {
      await tx.insert(mealSuggestions).values(
        items.map((s) => ({
          sessionId,
          mealName: s.mealName,
          requiredIngredients: s.requiredIngredients,
          aiGenerated: true,
        })),
      );
    }
    return null;
  });
}

export const MANUAL_SUGGESTION_CAP = 15;

/** Append a single manual suggestion from a catalog dish. Error string or null. */
export async function addCatalogSuggestion(
  userId: string,
  groupId: string,
  sessionId: string,
  dishId: string,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(mealSessions)
      .where(and(eq(mealSessions.id, sessionId), eq(mealSessions.groupId, groupId)))
      .limit(1)
      .for("update");
    if (!session) return "Session not found";
    if (session.status === "finalized" || session.status === "cancelled") {
      return "Voting is closed";
    }

    const [dish] = await tx
      .select()
      .from(dishes)
      .where(eq(dishes.id, dishId))
      .limit(1);
    if (!dish) return "Dish not found";

    const existing = await tx
      .select({ mealName: mealSuggestions.mealName })
      .from(mealSuggestions)
      .where(eq(mealSuggestions.sessionId, sessionId));
    if (existing.length >= MANUAL_SUGGESTION_CAP) {
      return "This session already has the maximum number of suggestions";
    }
    const dup = existing.some(
      (e) => e.mealName.trim().toLowerCase() === dish.name.trim().toLowerCase(),
    );
    if (dup) return "Already suggested";

    await tx.insert(mealSuggestions).values({
      sessionId,
      mealName: dish.name,
      requiredIngredients: dish.requiredIngredients,
      aiGenerated: false,
      addedBy: userId,
      dishId: dish.id,
    });
    return null;
  });
}

/** Remove a suggestion from the session (admin or author). Catalog dish untouched. */
export async function removeSuggestion(
  userId: string,
  groupId: string,
  isAdmin: boolean,
  sessionId: string,
  suggestionId: string,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(mealSessions)
      .where(and(eq(mealSessions.id, sessionId), eq(mealSessions.groupId, groupId)))
      .limit(1)
      .for("update");
    if (!session) return "Session not found";
    if (session.status === "finalized") return "Voting is closed";

    const [sug] = await tx
      .select({ id: mealSuggestions.id, addedBy: mealSuggestions.addedBy })
      .from(mealSuggestions)
      .where(
        and(eq(mealSuggestions.id, suggestionId), eq(mealSuggestions.sessionId, sessionId)),
      )
      .limit(1);
    if (!sug) return "Suggestion not found";
    if (!isAdmin && sug.addedBy !== userId) {
      return "You can only remove suggestions you added";
    }

    await tx.delete(mealSuggestions).where(eq(mealSuggestions.id, suggestionId));
    return null;
  });
}
