// @vitest-environment node
import { beforeAll, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

import { db } from "@/db";
import { groupMembers, groups, mealSessions, mealSuggestions, users } from "@/db/schema";
import { castVoteForUser, finalizeSessionForGroup } from "./votes";

let groupId: string;
let sessionId: string;
let sugA: string;
let sugB: string;

beforeAll(async () => {
  await db.insert(users).values([
    { id: "admin", email: "admin@x.y" },
    { id: "m1", email: "m1@x.y" },
  ]);
  const [g] = await db
    .insert(groups)
    .values({ name: "Flat", inviteCode: "AAAAAA", createdBy: "admin" })
    .returning({ id: groups.id });
  groupId = g.id;
  await db.insert(groupMembers).values([
    { groupId, userId: "admin", role: "admin" },
    { groupId, userId: "m1", role: "member" },
  ]);
  const [s] = await db
    .insert(mealSessions)
    .values({ groupId, sessionDate: "2026-06-11", mealType: "lunch" })
    .returning({ id: mealSessions.id });
  sessionId = s.id;
  const sugs = await db
    .insert(mealSuggestions)
    .values([
      { sessionId, mealName: "Egg Fried Rice", requiredIngredients: ["egg", "rice"] },
      { sessionId, mealName: "Aloo Jeera", requiredIngredients: ["potato"] },
    ])
    .returning({ id: mealSuggestions.id });
  [sugA, sugB] = [sugs[0].id, sugs[1].id];
});

test("first vote flips the session to voting", async () => {
  const err = await castVoteForUser("m1", groupId, sessionId, sugA);
  expect(err).toBeNull();
  const [s] = await db.select().from(mealSessions);
  expect(s.status).toBe("voting");
});

test("a vote can be moved to another suggestion", async () => {
  const err = await castVoteForUser("m1", groupId, sessionId, sugB);
  expect(err).toBeNull();
});

test("voting for a suggestion from another session is rejected", async () => {
  const err = await castVoteForUser("m1", groupId, sessionId, crypto.randomUUID());
  expect(err).toBe("Invalid choice");
});

test("non-admin cannot finalize", async () => {
  expect(await finalizeSessionForGroup("m1", groupId, false, sessionId)).toBe(
    "Only an admin can finalize",
  );
});

test("finalize picks the winner and votes are closed afterwards", async () => {
  const err = await finalizeSessionForGroup("admin", groupId, true, sessionId);
  expect(err).toBeNull();
  const [s] = await db.select().from(mealSessions);
  expect(s.status).toBe("finalized");
  expect(await castVoteForUser("m1", groupId, sessionId, sugA)).toBe("Voting is closed");
  expect(await finalizeSessionForGroup("admin", groupId, true, sessionId)).toBe(
    "Already finalized",
  );
});

test("finalize with zero votes returns an error and changes nothing", async () => {
  const [s2] = await db
    .insert(mealSessions)
    .values({ groupId, sessionDate: "2026-06-12", mealType: "lunch" })
    .returning({ id: mealSessions.id });
  await db.insert(mealSuggestions).values({ sessionId: s2.id, mealName: "Poha", requiredIngredients: [] });
  expect(await finalizeSessionForGroup("admin", groupId, true, s2.id)).toBe("No votes yet");
});
