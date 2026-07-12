import { headers } from "next/headers";

/**
 * Best-effort client IP, for rate limiting the unauthenticated auth endpoints.
 *
 * Returns null when no proxy header is present (local dev, a misconfigured proxy).
 * Callers must skip the IP limit in that case rather than fall back to a shared
 * "unknown" bucket, which would let one caller exhaust the budget for everybody.
 *
 * Trust note: x-forwarded-for is caller-supplied and only meaningful because the
 * hosting proxy overwrites it. Behind a proxy that appends rather than replaces,
 * the left-most entry is spoofable — so this blunts scripted abuse, it does not
 * stop a determined attacker. The per-email limits are the real backstop.
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() || null;
}
