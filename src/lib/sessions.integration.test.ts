// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { groups, mealSessions, users } from "@/db/schema";
import { toDateString } from "@/lib/meal-utils";
import { getOrCreateTodaySessions } from "./sessions";

const TZ = "Asia/Kolkata";
let groupId: string;

beforeEach(async () => {
  await db.delete(mealSessions);
  await db.delete(groups);
  await db.delete(users);

  await db.insert(users).values({ id: "u1", email: "u1@x.y" });
  const [group] = await db
    .insert(groups)
    .values({ name: "Flat 302", inviteCode: "ABC123", createdBy: "u1", timezone: TZ })
    .returning({ id: groups.id });
  groupId = group.id;
});

const todaysRows = () =>
  db.select().from(mealSessions).where(eq(mealSessions.groupId, groupId));

test("creates both sessions on the first call of the day", async () => {
  const { lunch, dinner } = await getOrCreateTodaySessions(groupId, TZ);

  expect(lunch.mealType).toBe("lunch");
  expect(dinner.mealType).toBe("dinner");
  const today = toDateString(new Date(), TZ);
  expect(lunch.sessionDate).toBe(today);
  expect(dinner.sessionDate).toBe(today);
  expect(await todaysRows()).toHaveLength(2);
});

// The whole point of the read-first path: once the day's rows exist, the dashboard
// must not write on every render. Asserting on row count alone would not catch a
// regression here — an INSERT ... ON CONFLICT DO NOTHING also leaves two rows.
test("is idempotent: a later call reuses the rows and issues no write", async () => {
  const first = await getOrCreateTodaySessions(groupId, TZ);

  const insert = vi.spyOn(db, "insert");
  const second = await getOrCreateTodaySessions(groupId, TZ);
  // Read the count before restoring: mockRestore() also wipes the call history,
  // which would make the assertion below pass no matter what.
  const writes = insert.mock.calls.length;
  insert.mockRestore();

  expect(writes).toBe(0);
  expect(second.lunch.id).toBe(first.lunch.id);
  expect(second.dinner.id).toBe(first.dinner.id);
  expect(await todaysRows()).toHaveLength(2);
});

// The read-first path has to cope with a half-built day: only the missing meal
// gets inserted, and the existing row must be returned untouched.
test("backfills only the missing meal when one already exists", async () => {
  const today = toDateString(new Date(), TZ);
  const [existing] = await db
    .insert(mealSessions)
    .values({ groupId, sessionDate: today, mealType: "lunch", status: "voting" })
    .returning();

  const { lunch, dinner } = await getOrCreateTodaySessions(groupId, TZ);

  expect(lunch.id).toBe(existing.id);
  expect(lunch.status).toBe("voting");
  expect(dinner.mealType).toBe("dinner");
  expect(await todaysRows()).toHaveLength(2);
});

// Two flatmates opening the dashboard at once on a fresh day race to insert the
// same rows; the unique index makes the loser's insert a no-op, not a crash.
test("concurrent first renders converge on one pair of sessions", async () => {
  const [a, b] = await Promise.all([
    getOrCreateTodaySessions(groupId, TZ),
    getOrCreateTodaySessions(groupId, TZ),
  ]);

  expect(a.lunch.id).toBe(b.lunch.id);
  expect(a.dinner.id).toBe(b.dinner.id);
  expect(await todaysRows()).toHaveLength(2);
});
