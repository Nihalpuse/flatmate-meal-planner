import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { env } from "@/env";

/**
 * Fixed-window in-memory rate limiter. Per server instance only.
 *
 * This is the fallback used when Redis is not configured (local dev, tests, or a
 * single-instance deployment). Prefer checkRateLimit: on a multi-instance
 * deployment this limiter is trivially bypassed by landing on another instance.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
}

const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

/** True when limits hold across every server instance rather than per-process. */
export const isDistributedRateLimit = redis !== null;

// One Ratelimit per (limit, window) pair. They are cheap but stateful enough that
// rebuilding one on every request is pure waste.
const limiters = new Map<string, Ratelimit>();

function limiterFor(limit: number, windowMs: number): Ratelimit {
  const cacheKey = `${limit}:${windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      prefix: "rl",
      analytics: false,
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

/**
 * Consume one unit of `key`'s budget. False means the budget is exhausted.
 *
 * Redis-backed when UPSTASH_REDIS_REST_* are set, so the limit holds across all
 * instances — this is what actually protects the paid Gemini endpoints. Falls back
 * to the in-memory limiter when Redis is absent, and also when it is unreachable:
 * a degraded limit beats failing the user's request outright.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  if (!redis) return rateLimit(key, limit, windowMs);
  try {
    const { success } = await limiterFor(limit, windowMs).limit(key);
    return success;
  } catch {
    return rateLimit(key, limit, windowMs);
  }
}
