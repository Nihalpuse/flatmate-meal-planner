import { Redis } from "@upstash/redis";

import { env } from "@/env";

/**
 * Shared Upstash client, or null when Redis is not configured.
 *
 * Optional on purpose: local dev, tests and single-instance deployments run without
 * it, and every caller must have a working fallback. Callers should treat Redis as a
 * cache, never as the source of truth — an eviction or an outage must degrade, not
 * break.
 */
export const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

/** True when Redis is available, i.e. state is shared across server instances. */
export const isRedisConfigured = redis !== null;
