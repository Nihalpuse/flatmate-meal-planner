// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
// No Redis in tests: currentAuthState must fall through to Postgres.
vi.mock("@/lib/redis", () => ({ redis: null, isRedisConfigured: false }));

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { currentAuthState, markEmailVerified, revokeUserSessions } from "./auth-state";

/** The token version alone — null when the user is gone. */
const version = async (userId: string) => (await currentAuthState(userId))?.version ?? null;

beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values({ id: "u1", email: "u1@x.y" });
});

test("a fresh user starts at version 0", async () => {
  expect(await version("u1")).toBe(0);
});

test("a deleted user reads as null, which revokes their tokens", async () => {
  await db.delete(users).where(eq(users.id, "u1"));
  expect(await version("u1")).toBeNull();
});

// This is the whole point of the feature: a token minted before the bump must stop
// verifying afterwards. The jwt callback compares the stamped version to this one.
test("revoking bumps the version, so a token stamped earlier no longer matches", async () => {
  const stampedIntoToken = await version("u1");
  expect(stampedIntoToken).toBe(0);

  const afterRevoke = await revokeUserSessions("u1");

  expect(afterRevoke).toBe(1);
  expect(await version("u1")).toBe(1);
  expect(afterRevoke).not.toBe(stampedIntoToken);
});

test("revoking twice keeps moving the version forward", async () => {
  await revokeUserSessions("u1");
  expect(await revokeUserSessions("u1")).toBe(2);
});

test("revoking only touches the target user", async () => {
  await db.insert(users).values({ id: "u2", email: "u2@x.y" });
  await revokeUserSessions("u1");

  expect(await version("u1")).toBe(1);
  expect(await version("u2")).toBe(0);
});

test("revoking an unknown user is a no-op rather than a crash", async () => {
  expect(await revokeUserSessions("nobody")).toBeNull();
});

test("a fresh user is unconfirmed, and marking flips it", async () => {
  expect((await currentAuthState("u1"))?.emailConfirmed).toBe(false);

  await markEmailVerified("u1");

  expect((await currentAuthState("u1"))?.emailConfirmed).toBe(true);
});

// The confirmation timestamp is a record of when the address was proven. A second
// verification — a replayed link, a Google sign-in on an already-confirmed account —
// must not quietly rewrite that.
test("marking an already-confirmed address does not move the timestamp", async () => {
  await markEmailVerified("u1");
  const [first] = await db
    .select({ at: users.emailVerified })
    .from(users)
    .where(eq(users.id, "u1"));

  await markEmailVerified("u1");
  const [second] = await db
    .select({ at: users.emailVerified })
    .from(users)
    .where(eq(users.id, "u1"));

  expect(second.at).toEqual(first.at);
});

test("revoking a confirmed user's sessions leaves them confirmed", async () => {
  await markEmailVerified("u1");
  await revokeUserSessions("u1");

  expect(await currentAuthState("u1")).toEqual({ version: 1, emailConfirmed: true });
});
