// @vitest-environment node
import { beforeAll, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { groups, mealSessions, mealSuggestions, users, votes } from "@/db/schema";
import { claimGeneration, replaceSuggestions } from "./suggestions";

let groupId: string;
let sessionId: string;

beforeAll(async () => {
  await db.insert(users).values({ id: "u1", email: "u1@x.y" });
  const [g] = await db
    .insert(groups)
    .values({ name: "Flat", inviteCode: "BBBBBB", createdBy: "u1" })
    .returning({ id: groups.id });
  groupId = g.id;
  const [s] = await db
    .insert(mealSessions)
    .values({ groupId, sessionDate: "2026-06-11", mealType: "dinner" })
    .returning({ id: mealSessions.id });
  sessionId = s.id;
});

test("first claim succeeds, immediate second claim is cooldown-blocked", async () => {
  const first = await claimGeneration(sessionId, groupId);
  expect("session" in first && first.session.mealType).toBe("dinner");
  const second = await claimGeneration(sessionId, groupId);
  expect(second).toEqual({ error: "Please wait a moment before regenerating." });
});

test("claim on an unknown session errors", async () => {
  expect(await claimGeneration(crypto.randomUUID(), groupId)).toEqual({
    error: "Session not found",
  });
});

test("replaceSuggestions swaps the list while open", async () => {
  const err = await replaceSuggestions(sessionId, [
    { mealName: "Poha", requiredIngredients: ["poha"] },
  ]);
  expect(err).toBeNull();
  const rows = await db.select().from(mealSuggestions);
  expect(rows.map((r) => r.mealName)).toEqual(["Poha"]);
});

test("replaceSuggestions refuses once voting has started (votes survive)", async () => {
  const [sug] = await db.select().from(mealSuggestions).limit(1);
  await db.insert(votes).values({ sessionId, suggestionId: sug.id, userId: "u1" });
  await db
    .update(mealSessions)
    .set({ status: "voting" })
    .where(eq(mealSessions.id, sessionId));

  const err = await replaceSuggestions(sessionId, [
    { mealName: "Upma", requiredIngredients: [] },
  ]);
  expect(err).toBe("Voting has started — regenerate is locked.");
  expect(await db.select().from(votes)).toHaveLength(1);
});

test("claim refuses once voting has started", async () => {
  expect(await claimGeneration(sessionId, groupId)).toEqual({
    error: "Voting has started — regenerate is locked.",
  });
});
