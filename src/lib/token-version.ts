import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { redis } from "@/lib/redis";

/**
 * Server-side revocation for stateless JWT sessions.
 *
 * An Auth.js JWT is self-contained: once issued it is valid until it expires, and
 * nothing on the server can call it back. Stamping the user's token version into the
 * token and re-checking it on every request restores that ability — bump the version
 * and every token already out there stops verifying on its next use.
 *
 * Postgres is the source of truth. Redis is only a read cache in front of it, since
 * this runs on every authenticated request and we do not want to re-add the per
 * request database hit we spent this codebase's history removing. A bump writes
 * through to Redis, so revocation is immediate rather than TTL-bound; an eviction or
 * an outage just costs a database read.
 */

const TTL_SECONDS = 300;

const key = (userId: string) => `tv:${userId}`;

/**
 * Whether a token's stamped version still entitles it to a session. Pure, so the rule
 * itself is testable without standing up Auth.js.
 *
 * `stamped` is undefined for tokens minted before this feature shipped. Those are
 * grandfathered in as version 0, which is the default every existing user already
 * carries — so nobody is force-logged-out by the deploy, and nothing is given away:
 * a revocation bumps past 0 and kills them like any other stale token.
 */
export function isTokenVersionCurrent(
  stamped: number | undefined,
  current: number | null,
): boolean {
  if (current === null) return false; // user deleted — their tokens die with them
  return (stamped ?? 0) === current;
}

/**
 * The user's current token version, or null if the user no longer exists — which is
 * itself a revocation: their tokens must stop working.
 */
export async function currentTokenVersion(userId: string): Promise<number | null> {
  if (redis) {
    try {
      const cached = await redis.get<number>(key(userId));
      if (typeof cached === "number") return cached;
    } catch {
      // Fall through to the database. A cache that is down must not lock users out.
    }
  }

  const [row] = await db
    .select({ version: users.tokenVersion })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;

  if (redis) {
    try {
      await redis.set(key(userId), row.version, { ex: TTL_SECONDS });
    } catch {
      // Caching is best-effort.
    }
  }
  return row.version;
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
    .returning({ version: users.tokenVersion });
  if (!row) return null;

  if (redis) {
    try {
      await redis.set(key(userId), row.version, { ex: TTL_SECONDS });
    } catch {
      // If the write-through fails, the stale entry still expires within TTL_SECONDS,
      // and the database already holds the new version.
    }
  }
  return row.version;
}
