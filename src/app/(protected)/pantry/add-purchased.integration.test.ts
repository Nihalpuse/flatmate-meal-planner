// @vitest-environment node
import { beforeAll, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { groupMembers, groups, ingredients, users } from "@/db/schema";
import { addPurchasedItems } from "./actions";

let groupId: string;

beforeAll(async () => {
  await db.insert(users).values({ id: "u1", email: "u1@x.y" });
  const [g] = await db
    .insert(groups)
    .values({ name: "Flat", inviteCode: "CCCCCC", createdBy: "u1" })
    .returning({ id: groups.id });
  groupId = g.id;
  await db.insert(groupMembers).values({ groupId, userId: "u1", role: "admin" });
});

beforeEach(async () => {
  await db.delete(ingredients);
  auth.mockResolvedValue({ user: { id: "u1" } });
});

async function rows() {
  return db
    .select()
    .from(ingredients)
    .where(eq(ingredients.groupId, groupId))
    .orderBy(ingredients.name);
}

test("inserts new items", async () => {
  const res = await addPurchasedItems([
    { name: "potato", quantity: 2, unit: "kg" },
    { name: "milk" },
  ]);
  expect(res).toEqual({ ok: true });
  const r = await rows();
  expect(r.map((x) => x.name)).toEqual(["milk", "potato"]);
  expect(r.find((x) => x.name === "potato")).toMatchObject({ quantity: 2, unit: "kg" });
  expect(r.find((x) => x.name === "milk")).toMatchObject({ quantity: null, unit: null });
});

test("sums quantity when units match, marks available", async () => {
  await db
    .insert(ingredients)
    .values({ groupId, name: "Rice", quantity: 1, unit: "kg", available: false });
  await addPurchasedItems([{ name: "rice", quantity: 2, unit: "kg" }]);
  const [rice] = await rows();
  expect(rice).toMatchObject({ quantity: 3, unit: "kg", available: true });
});

test("replaces when units differ", async () => {
  await db.insert(ingredients).values({ groupId, name: "oil", quantity: 1, unit: "l" });
  await addPurchasedItems([{ name: "oil", quantity: 2, unit: "packet" }]);
  const [oil] = await rows();
  expect(oil).toMatchObject({ quantity: 2, unit: "packet" });
});

test("rejects an invalid item without writing", async () => {
  const res = await addPurchasedItems([{ name: "", quantity: 1 }]);
  expect(res.error).toBeTruthy();
  expect(await rows()).toHaveLength(0);
});

test("empty list is a no-op success", async () => {
  expect(await addPurchasedItems([])).toEqual({ ok: true });
});
