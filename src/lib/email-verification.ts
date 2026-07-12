import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { and, eq, isNull, lt } from "drizzle-orm";

import { db } from "@/db";
import { users, verificationTokens } from "@/db/schema";
import { markEmailVerified } from "@/lib/auth-state";

/**
 * Email verification tokens.
 *
 * Reuses the verification_tokens table, which the Auth.js schema already carries and
 * which nothing else populates: the adapter only writes to it for the email/magic-link
 * provider, and this app has none.
 *
 * The raw token goes in the emailed link and is never stored. Only its SHA-256 lands
 * in the table, so a leaked database dump does not hand out working verification links
 * — same reasoning as hashing a password. SHA-256 rather than bcrypt is right here:
 * the token is 32 random bytes, so there is no low-entropy guess to slow down.
 */

const TTL_MS = 24 * 60 * 60 * 1000;

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Mint a token for an address and store only its hash. Returns the raw token. */
export async function issueVerificationToken(email: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");

  // One live token per address: minting a new one retires whatever came before, so a
  // "resend" cannot leave an older link working.
  await db.delete(verificationTokens).where(eq(verificationTokens.identifier, email));
  await db.insert(verificationTokens).values({
    identifier: email,
    token: hash(raw),
    expires: new Date(Date.now() + TTL_MS),
  });

  return raw;
}

export type VerifyResult =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid" | "expired" };

/**
 * Consume a raw token: verify it, mark the address confirmed, and burn the token.
 *
 * Single-use. An expired token is reported separately from a bogus one so the page can
 * offer to resend rather than just saying "invalid".
 */
export async function consumeVerificationToken(raw: string): Promise<VerifyResult> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "invalid" };

  const digest = hash(trimmed);
  const [row] = await db
    .select()
    .from(verificationTokens)
    .where(eq(verificationTokens.token, digest))
    .limit(1);
  if (!row) return { ok: false, reason: "invalid" };

  // The lookup above already matched on the hash, so this only guards against a
  // partial-match oracle in the unlikely event the query ever loosens.
  if (!constantTimeEquals(row.token, digest)) return { ok: false, reason: "invalid" };

  if (row.expires.getTime() <= Date.now()) {
    await db.delete(verificationTokens).where(eq(verificationTokens.token, digest));
    return { ok: false, reason: "expired" };
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, row.identifier))
    .limit(1);
  // Token outlived its user: burn it and treat it as bogus.
  if (!user) {
    await db.delete(verificationTokens).where(eq(verificationTokens.token, digest));
    return { ok: false, reason: "invalid" };
  }

  await markEmailVerified(user.id);
  await db.delete(verificationTokens).where(eq(verificationTokens.token, digest));

  return { ok: true, email: row.identifier };
}

/** Drop tokens that have already expired. Safe to call opportunistically. */
export async function purgeExpiredTokens(): Promise<void> {
  await db.delete(verificationTokens).where(lt(verificationTokens.expires, new Date()));
}

/**
 * The unverified user for an address, if there is one. Used by the resend flow.
 *
 * isNull, not eq(..., null): in SQL, `= NULL` is never true, so an eq would silently
 * match nobody and every resend would look like an unknown address.
 */
export async function unverifiedUserByEmail(
  email: string,
): Promise<{ id: string } | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.emailVerified)))
    .limit(1);
  return user ?? null;
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
