import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  finalizedMeals,
  mealSessions,
  mealSuggestions,
  votes,
} from "@/db/schema";

export interface WinnerRow {
  id: string;
  votes: number;
  createdAt: Date;
}

/** Winner = most votes, ties broken by earliest createdAt. Null if no votes. */
export function pickWinner(rows: WinnerRow[]): string | null {
  let best: WinnerRow | null = null;
  for (const r of rows) {
    if (r.votes <= 0) continue;
    if (
      !best ||
      r.votes > best.votes ||
      (r.votes === best.votes && r.createdAt < best.createdAt)
    ) {
      best = r;
    }
  }
  return best?.id ?? null;
}

export interface SuggestionVote {
  id: string;
  mealName: string;
  requiredIngredients: string[];
  votes: number;
  mine: boolean;
}

export interface SessionVoteState {
  suggestions: SuggestionVote[];
  totalVoters: number;
}

/** Per-suggestion vote counts + whether the given user voted for each. */
export async function getSessionVoteState(
  sessionId: string,
  userId: string,
): Promise<SessionVoteState> {
  const suggestions = await db
    .select()
    .from(mealSuggestions)
    .where(eq(mealSuggestions.sessionId, sessionId))
    .orderBy(mealSuggestions.createdAt);

  const voteRows = await db
    .select({ suggestionId: votes.suggestionId, userId: votes.userId })
    .from(votes)
    .where(eq(votes.sessionId, sessionId));

  const counts = new Map<string, number>();
  let myVote: string | null = null;
  for (const v of voteRows) {
    counts.set(v.suggestionId, (counts.get(v.suggestionId) ?? 0) + 1);
    if (v.userId === userId) myVote = v.suggestionId;
  }

  return {
    suggestions: suggestions.map((s) => ({
      id: s.id,
      mealName: s.mealName,
      requiredIngredients: s.requiredIngredients,
      votes: counts.get(s.id) ?? 0,
      mine: myVote === s.id,
    })),
    totalVoters: voteRows.length,
  };
}

/** Cast or move the user's single vote for a session. Returns an error string or null. */
export async function castVoteForUser(
  userId: string,
  groupId: string,
  sessionId: string,
  suggestionId: string,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    // Row lock: serializes against finalize and regenerate for this session.
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

    const [sug] = await tx
      .select({ id: mealSuggestions.id })
      .from(mealSuggestions)
      .where(
        and(eq(mealSuggestions.id, suggestionId), eq(mealSuggestions.sessionId, sessionId)),
      )
      .limit(1);
    if (!sug) return "Invalid choice";

    // Flip to "voting" before the vote lands so regenerate (which requires
    // status "open" under the same row lock) can never cascade-delete it.
    if (session.status === "open") {
      await tx
        .update(mealSessions)
        .set({ status: "voting" })
        .where(eq(mealSessions.id, sessionId));
    }

    await tx
      .insert(votes)
      .values({ sessionId, suggestionId, userId })
      .onConflictDoUpdate({
        target: [votes.sessionId, votes.userId],
        set: { suggestionId },
      });
    return null;
  });
}

/** Admin-only finalize: pick the winner and lock the session. Returns error or null. */
export async function finalizeSessionForGroup(
  userId: string,
  groupId: string,
  isAdmin: boolean,
  sessionId: string,
): Promise<string | null> {
  if (!isAdmin) return "Only an admin can finalize";
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(mealSessions)
      .where(and(eq(mealSessions.id, sessionId), eq(mealSessions.groupId, groupId)))
      .limit(1)
      .for("update");
    if (!session) return "Session not found";
    if (session.status === "finalized") return "Already finalized";

    // Tally inside the transaction: the row lock blocks concurrent casts,
    // so the count cannot change between tally and status flip.
    const rows = await tx
      .select({
        id: mealSuggestions.id,
        mealName: mealSuggestions.mealName,
        createdAt: mealSuggestions.createdAt,
        votes: sql<number>`count(${votes.id})::int`,
      })
      .from(mealSuggestions)
      .leftJoin(votes, eq(votes.suggestionId, mealSuggestions.id))
      .where(eq(mealSuggestions.sessionId, sessionId))
      .groupBy(mealSuggestions.id);

    const winnerId = pickWinner(
      rows.map((r) => ({ id: r.id, votes: r.votes, createdAt: r.createdAt })),
    );
    if (!winnerId) return "No votes yet";
    const winner = rows.find((r) => r.id === winnerId)!;

    await tx.insert(finalizedMeals).values({
      sessionId,
      suggestionId: winner.id,
      mealName: winner.mealName,
      finalizedBy: userId,
    });
    await tx
      .update(mealSessions)
      .set({ status: "finalized" })
      .where(eq(mealSessions.id, sessionId));
    return null;
  });
}

export async function getFinalizedMeal(
  sessionId: string,
): Promise<{ mealName: string } | null> {
  const [row] = await db
    .select({ mealName: finalizedMeals.mealName })
    .from(finalizedMeals)
    .where(eq(finalizedMeals.sessionId, sessionId))
    .limit(1);
  return row ?? null;
}
