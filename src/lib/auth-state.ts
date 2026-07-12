import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { redis } from "@/lib/redis";

/**
 * The per-user facts that every authenticated request has to re-check.
 *
 * Both exist because an Auth.js JWT is self-contained: once issued it stands until it
 * expires, so anything that can change underneath it must be re-read rather than
 * trusted from the token.
 *
 * - `version` makes stateless sessions revocable. Bump it and every token already
 *   issued to that user stops verifying on its next use.
 * - `emailConfirmed` gates the app on a confirmed address. It cannot be read from the
 *   token alone, or verifying would not take effect until the user next signed in.
 *
 * They are fetched and cached together, so the whole check costs one Redis round trip
 * rather than a database hit per request.
 *
 * Postgres is the source of truth; Redis is only a read cache in front of it. Writes
 * go through the cache, so a revocation takes effect immediately rather than waiting
 * out a TTL. An eviction or an outage costs a query, never a lockout.
 */
export interface AuthState {
  version: number;
  /** Boolean, unlike the users.emailVerified timestamp it is derived from. */
  emailConfirmed: boolean;
}

const TTL_SECONDS = 300;

const key = (userId: string) => `auth:${userId}`;

async function readCache(userId: string): Promise<AuthState | null> {
  if (!redis) return null;
  try {
    const cached = await redis.get<AuthState>(key(userId));
    if (cached && typeof cached.version === "number") return cached;
  } catch {
    // A cache that is down must not lock users out. Fall through to Postgres.
  }
  return null;
}

async function writeCache(userId: string, state: AuthState): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key(userId), state, { ex: TTL_SECONDS });
  } catch {
    // Best-effort. Postgres already holds the truth.
  }
}

async function dropCache(userId: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(key(userId));
  } catch {
    // Best-effort: the entry expires within TTL_SECONDS anyway.
  }
}

/**
 * The user's current auth state, or null if the user no longer exists — which is
 * itself a revocation: their tokens must stop working.
 */
export async function currentAuthState(userId: string): Promise<AuthState | null> {
  const cached = await readCache(userId);
  if (cached) return cached;

  const [row] = await db
    .select({ version: users.tokenVersion, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;

  const state: AuthState = {
    version: row.version,
    emailConfirmed: row.emailVerified !== null,
  };
  await writeCache(userId, state);
  return state;
}

/**
 * Whether a token's stamped version still entitles it to a session. Pure, so the rule
 * itself is testable without standing up Auth.js.
 *
 * `stamped` is undefined for tokens minted before versioning shipped. Those are
 * grandfathered in as version 0, which is the default every existing user already
 * carries — so nobody is force-logged-out by the deploy, and nothing is given away: a
 * revocation bumps past 0 and kills them like any other stale token.
 */
export function isTokenVersionCurrent(
  stamped: number | undefined,
  current: number | null,
): boolean {
  if (current === null) return false; // user deleted — their tokens die with them
  return (stamped ?? 0) === current;
}

/**
 * Invalidate every session already issued to this user. Returns the new version.
 *
 * Write-through: the new value lands in Redis in the same breath, so a token revoked
 * here fails its very next request rather than lingering until the cache expires.
 */
export async function revokeUserSessions(userId: string): Promise<number | null> {
  const [row] = await db
    .update(users)
    .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
    .where(eq(users.id, userId))
    .returning({ version: users.tokenVersion, emailVerified: users.emailVerified });
  if (!row) return null;

  await writeCache(userId, {
    version: row.version,
    emailConfirmed: row.emailVerified !== null,
  });
  return row.version;
}

/**
 * Mark the address confirmed. Only ever sets the timestamp once, so re-verifying an
 * already-verified account cannot silently move it.
 */
export async function markEmailVerified(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ emailVerified: new Date() })
    .where(sql`${users.id} = ${userId} and ${users.emailVerified} is null`);
  // Drop rather than write through: that update may have matched nothing, so only the
  // row knows the truth now.
  await dropCache(userId);
}
