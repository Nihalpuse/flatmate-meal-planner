import { and, eq, inArray, sql } from "drizzle-orm";

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
  addedBy: string | null;
}

export interface SessionVoteState {
  suggestions: SuggestionVote[];
  totalVoters: number;
}

/** Pure: per-session vote state from raw rows. Exported for tests. */
export function buildVoteState(
  sessionIds: string[],
  suggestions: {
    id: string;
    sessionId: string;
    mealName: string;
    requiredIngredients: string[];
    addedBy: string | null;
  }[],
  voteRows: { sessionId: string; suggestionId: string; userId: string }[],
  userId: string,
): Map<string, SessionVoteState> {
  const state = new Map<string, SessionVoteState>(
    sessionIds.map((id) => [id, { suggestions: [], totalVoters: 0 }]),
  );

  const counts = new Map<string, number>();
  const mine = new Set<string>();
  for (const v of voteRows) {
    counts.set(v.suggestionId, (counts.get(v.suggestionId) ?? 0) + 1);
    if (v.userId === userId) mine.add(v.suggestionId);
    const s = state.get(v.sessionId);
    if (s) s.totalVoters += 1;
  }

  for (const sug of suggestions) {
    state.get(sug.sessionId)?.suggestions.push({
      id: sug.id,
      mealName: sug.mealName,
      requiredIngredients: sug.requiredIngredients,
      votes: counts.get(sug.id) ?? 0,
      mine: mine.has(sug.id),
      addedBy: sug.addedBy,
    });
  }
  return state;
}

/** Vote state for several sessions in two queries. */
export async function getVoteStateForSessions(
  sessionIds: string[],
  userId: string,
): Promise<Map<string, SessionVoteState>> {
  if (sessionIds.length === 0) return new Map();
  const suggestions = await db
    .select()
    .from(mealSuggestions)
    .where(inArray(mealSuggestions.sessionId, sessionIds))
    .orderBy(mealSuggestions.createdAt);
  const voteRows = await db
    .select({
      sessionId: votes.sessionId,
      suggestionId: votes.suggestionId,
      userId: votes.userId,
    })
    .from(votes)
    .where(inArray(votes.sessionId, sessionIds));
  return buildVoteState(sessionIds, suggestions, voteRows, userId);
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

/** Remove the caller's own vote for a session (unvote). Error string or null. */
export async function clearVoteForUser(
  userId: string,
  groupId: string,
  sessionId: string,
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
    await tx
      .delete(votes)
      .where(and(eq(votes.sessionId, sessionId), eq(votes.userId, userId)));
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

/** Finalized meal names keyed by session id. */
export async function getFinalizedMealsForSessions(
  sessionIds: string[],
): Promise<Map<string, { mealName: string }>> {
  if (sessionIds.length === 0) return new Map();
  const rows = await db
    .select({ sessionId: finalizedMeals.sessionId, mealName: finalizedMeals.mealName })
    .from(finalizedMeals)
    .where(inArray(finalizedMeals.sessionId, sessionIds));
  return new Map(rows.map((r) => [r.sessionId, { mealName: r.mealName }]));
}
