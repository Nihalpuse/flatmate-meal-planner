// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
// No Redis in tests: currentTokenVersion must fall through to Postgres.
vi.mock("@/lib/redis", () => ({ redis: null, isRedisConfigured: false }));

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { currentTokenVersion, revokeUserSessions } from "./token-version";

beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values({ id: "u1", email: "u1@x.y" });
});

test("a fresh user starts at version 0", async () => {
  expect(await currentTokenVersion("u1")).toBe(0);
});

test("a deleted user reads as null, which revokes their tokens", async () => {
  await db.delete(users).where(eq(users.id, "u1"));
  expect(await currentTokenVersion("u1")).toBeNull();
});

// This is the whole point of the feature: a token minted before the bump must stop
// verifying afterwards. The jwt callback compares the stamped version to this one.
test("revoking bumps the version, so a token stamped earlier no longer matches", async () => {
  const stampedIntoToken = await currentTokenVersion("u1");
  expect(stampedIntoToken).toBe(0);

  const afterRevoke = await revokeUserSessions("u1");

  expect(afterRevoke).toBe(1);
  expect(await currentTokenVersion("u1")).toBe(1);
  expect(afterRevoke).not.toBe(stampedIntoToken);
});

test("revoking twice keeps moving the version forward", async () => {
  await revokeUserSessions("u1");
  expect(await revokeUserSessions("u1")).toBe(2);
});

test("revoking only touches the target user", async () => {
  await db.insert(users).values({ id: "u2", email: "u2@x.y" });
  await revokeUserSessions("u1");

  expect(await currentTokenVersion("u1")).toBe(1);
  expect(await currentTokenVersion("u2")).toBe(0);
});

test("revoking an unknown user is a no-op rather than a crash", async () => {
  expect(await revokeUserSessions("nobody")).toBeNull();
});
