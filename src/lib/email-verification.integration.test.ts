// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/redis", () => ({ redis: null, isRedisConfigured: false }));

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, verificationTokens } from "@/db/schema";
import {
  consumeVerificationToken,
  issueVerificationToken,
  purgeExpiredTokens,
  unverifiedUserByEmail,
} from "./email-verification";

const EMAIL = "flatmate@example.com";

beforeEach(async () => {
  await db.delete(verificationTokens);
  await db.delete(users);
  await db.insert(users).values({ id: "u1", email: EMAIL });
});

const verifiedAt = async () => {
  const [row] = await db
    .select({ at: users.emailVerified })
    .from(users)
    .where(eq(users.id, "u1"));
  return row.at;
};

test("issuing a token verifies nobody until it is used", async () => {
  await issueVerificationToken(EMAIL);
  expect(await verifiedAt()).toBeNull();
});

// The link is the credential. A database dump must not hand out working links, so the
// raw token must never be written down — only its digest.
test("the raw token is never stored, only its hash", async () => {
  const raw = await issueVerificationToken(EMAIL);

  const [row] = await db.select().from(verificationTokens);
  expect(row.token).not.toBe(raw);
  expect(row.token).toBe(createHash("sha256").update(raw).digest("hex"));
});

test("consuming a valid token marks the address verified", async () => {
  const raw = await issueVerificationToken(EMAIL);

  const result = await consumeVerificationToken(raw);

  expect(result).toEqual({ ok: true, email: EMAIL });
  expect(await verifiedAt()).toBeInstanceOf(Date);
});

test("a token is single use: replaying it fails", async () => {
  const raw = await issueVerificationToken(EMAIL);
  await consumeVerificationToken(raw);

  expect(await consumeVerificationToken(raw)).toEqual({ ok: false, reason: "invalid" });
  expect(await db.select().from(verificationTokens)).toHaveLength(0);
});

test("a token nobody issued is rejected", async () => {
  await issueVerificationToken(EMAIL);

  expect(await consumeVerificationToken("not-a-real-token")).toEqual({
    ok: false,
    reason: "invalid",
  });
  expect(await verifiedAt()).toBeNull();
});

test("an expired token is reported as expired, not merely invalid, and is burned", async () => {
  const raw = await issueVerificationToken(EMAIL);
  await db
    .update(verificationTokens)
    .set({ expires: new Date(Date.now() - 1000) })
    .where(eq(verificationTokens.identifier, EMAIL));

  expect(await consumeVerificationToken(raw)).toEqual({ ok: false, reason: "expired" });
  expect(await verifiedAt()).toBeNull();
  expect(await db.select().from(verificationTokens)).toHaveLength(0);
});

// Otherwise a "resend" would leave the earlier link working, widening the window in
// which a token intercepted once is still good.
test("issuing again retires the previous token", async () => {
  const first = await issueVerificationToken(EMAIL);
  const second = await issueVerificationToken(EMAIL);

  expect(await consumeVerificationToken(first)).toEqual({ ok: false, reason: "invalid" });
  expect(await consumeVerificationToken(second)).toEqual({ ok: true, email: EMAIL });
});

test("a token that outlived its user is rejected rather than crashing", async () => {
  const raw = await issueVerificationToken(EMAIL);
  await db.delete(users).where(eq(users.id, "u1"));

  expect(await consumeVerificationToken(raw)).toEqual({ ok: false, reason: "invalid" });
});

test("unverifiedUserByEmail finds the account before verification and not after", async () => {
  expect(await unverifiedUserByEmail(EMAIL)).toEqual({ id: "u1" });

  const raw = await issueVerificationToken(EMAIL);
  await consumeVerificationToken(raw);

  expect(await unverifiedUserByEmail(EMAIL)).toBeNull();
});

test("purgeExpiredTokens drops only the expired ones", async () => {
  await issueVerificationToken(EMAIL);
  await db.insert(verificationTokens).values({
    identifier: "stale@example.com",
    token: "deadbeef",
    expires: new Date(Date.now() - 1000),
  });

  await purgeExpiredTokens();

  const left = await db.select().from(verificationTokens);
  expect(left.map((t) => t.identifier)).toEqual([EMAIL]);
});
