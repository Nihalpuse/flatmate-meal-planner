import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { mealSessions, mealSuggestions, type MealSession } from "@/db/schema";
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
    await tx.delete(mealSuggestions).where(eq(mealSuggestions.sessionId, sessionId));
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
