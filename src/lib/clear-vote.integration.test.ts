// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { groupMembers, groups, mealSessions, mealSuggestions, users, votes } from "@/db/schema";
import { castVoteForUser, clearVoteForUser } from "./votes";

let groupId: string;
let sessionId: string;
let sugId: string;

beforeEach(async () => {
  await db.delete(groups);
  await db.delete(users);
  await db.insert(users).values([
    { id: "m1", email: "m1@x.y" },
    { id: "m2", email: "m2@x.y" },
  ]);
  const [g] = await db
    .insert(groups)
    .values({ name: "F", inviteCode: "BBBBBB", createdBy: "m1" })
    .returning({ id: groups.id });
  groupId = g.id;
  await db.insert(groupMembers).values([
    { groupId, userId: "m1", role: "admin" },
    { groupId, userId: "m2", role: "member" },
  ]);
  const [s] = await db
    .insert(mealSessions)
    .values({ groupId, sessionDate: "2026-06-29", mealType: "lunch" })
    .returning({ id: mealSessions.id });
  sessionId = s.id;
  const [sug] = await db
    .insert(mealSuggestions)
    .values({ sessionId, mealName: "Poha", requiredIngredients: [] })
    .returning({ id: mealSuggestions.id });
  sugId = sug.id;
});

test("clears only the caller's vote", async () => {
  await castVoteForUser("m1", groupId, sessionId, sugId);
  await castVoteForUser("m2", groupId, sessionId, sugId);
  expect(await clearVoteForUser("m1", groupId, sessionId)).toBeNull();
  const rows = await db.select().from(votes).where(eq(votes.sessionId, sessionId));
  expect(rows.map((r) => r.userId)).toEqual(["m2"]);
});

test("no-op when caller has no vote", async () => {
  expect(await clearVoteForUser("m1", groupId, sessionId)).toBeNull();
});

test("blocked once finalized", async () => {
  await castVoteForUser("m1", groupId, sessionId, sugId);
  await db.update(mealSessions).set({ status: "finalized" }).where(eq(mealSessions.id, sessionId));
  expect(await clearVoteForUser("m1", groupId, sessionId)).toBe("Voting is closed");
});
