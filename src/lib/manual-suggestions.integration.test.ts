// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dishes, groupMembers, groups, mealSessions, mealSuggestions, users } from "@/db/schema";
import { addCatalogSuggestion, removeSuggestion, replaceSuggestions } from "./suggestions";

let groupId: string;
let sessionId: string;
let dishId: string;

beforeEach(async () => {
  await db.delete(groups); // cascades members/sessions/suggestions/votes
  await db.delete(users);
  await db.delete(dishes);
  await db.insert(users).values([
    { id: "admin", email: "a@x.y" },
    { id: "m1", email: "m1@x.y" },
    { id: "m2", email: "m2@x.y" },
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
    .values({ groupId, sessionDate: "2026-06-29", mealType: "dinner" })
    .returning({ id: mealSessions.id });
  sessionId = s.id;
  const [d] = await db
    .insert(dishes)
    .values({ name: "Poha", requiredIngredients: ["flattened rice", "onion"], source: "seed" })
    .returning({ id: dishes.id });
  dishId = d.id;
});

test("adds a manual suggestion (aiGenerated false, addedBy, snapshot ingredients)", async () => {
  expect(await addCatalogSuggestion("m1", groupId, sessionId, dishId)).toBeNull();
  const [row] = await db.select().from(mealSuggestions);
  expect(row).toMatchObject({
    mealName: "Poha",
    aiGenerated: false,
    addedBy: "m1",
    dishId,
    requiredIngredients: ["flattened rice", "onion"],
  });
});

test("dedup by lower(name) within the session", async () => {
  await addCatalogSuggestion("m1", groupId, sessionId, dishId);
  expect(await addCatalogSuggestion("m1", groupId, sessionId, dishId)).toBe("Already suggested");
});

test("blocked when finalized", async () => {
  await db.update(mealSessions).set({ status: "finalized" }).where(eq(mealSessions.id, sessionId));
  expect(await addCatalogSuggestion("m1", groupId, sessionId, dishId)).toBe("Voting is closed");
});

test("author can remove, catalog dish survives", async () => {
  await addCatalogSuggestion("m1", groupId, sessionId, dishId);
  const [sug] = await db.select().from(mealSuggestions);
  expect(await removeSuggestion("m1", groupId, false, sessionId, sug.id)).toBeNull();
  expect(await db.select().from(mealSuggestions)).toHaveLength(0);
  expect(await db.select().from(dishes).where(eq(dishes.id, dishId))).toHaveLength(1);
});

test("non-author non-admin cannot remove", async () => {
  await addCatalogSuggestion("m1", groupId, sessionId, dishId);
  const [sug] = await db.select().from(mealSuggestions);
  expect(await removeSuggestion("m2", groupId, false, sessionId, sug.id)).toBe(
    "You can only remove suggestions you added",
  );
});

test("admin can remove anyone's suggestion", async () => {
  await addCatalogSuggestion("m1", groupId, sessionId, dishId);
  const [sug] = await db.select().from(mealSuggestions);
  expect(await removeSuggestion("admin", groupId, true, sessionId, sug.id)).toBeNull();
});

test("regenerate keeps manual rows, replaces AI ones", async () => {
  await db
    .insert(mealSuggestions)
    .values({ sessionId, mealName: "AI Dish", requiredIngredients: [], aiGenerated: true });
  await addCatalogSuggestion("m1", groupId, sessionId, dishId);
  const err = await replaceSuggestions(sessionId, [{ mealName: "New AI", requiredIngredients: [] }]);
  expect(err).toBeNull();
  const names = (
    await db.select().from(mealSuggestions).where(eq(mealSuggestions.sessionId, sessionId))
  )
    .map((r) => r.mealName)
    .sort();
  expect(names).toEqual(["New AI", "Poha"]);
});
