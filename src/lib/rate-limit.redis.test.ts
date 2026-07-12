// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const limitMock = vi.fn();

vi.mock("@upstash/redis", () => ({ Redis: class {} }));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = vi.fn((limit: number, window: string) => ({ limit, window }));
    limit = limitMock;
  },
}));

/** Re-import the module with Redis configured — the client is built at import time. */
async function loadWithRedis() {
  vi.resetModules();
  process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "token";
  return import("./rate-limit");
}

async function loadWithoutRedis() {
  vi.resetModules();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  return import("./rate-limit");
}

// Braces matter: a concise arrow would return the mock, and Vitest calls a function
// returned from beforeEach as a teardown hook — invoking limitMock with no awaiter
// and leaking an unhandled rejection out of the Redis-down test.
beforeEach(() => {
  limitMock.mockReset();
});
afterEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

test("with Redis configured, the verdict comes from Redis, not local memory", async () => {
  const { checkRateLimit, isDistributedRateLimit } = await loadWithRedis();
  expect(isDistributedRateLimit).toBe(true);

  limitMock.mockResolvedValue({ success: true });
  expect(await checkRateLimit("dish-ai:u1", 1, 60_000)).toBe(true);

  // The in-memory limiter would refuse this second call (limit of 1). Redis says
  // yes, so the answer is yes — proving we are not falling back silently.
  limitMock.mockResolvedValue({ success: true });
  expect(await checkRateLimit("dish-ai:u1", 1, 60_000)).toBe(true);

  expect(limitMock).toHaveBeenCalledTimes(2);
  expect(limitMock).toHaveBeenCalledWith("dish-ai:u1");
});

test("a Redis refusal is passed through", async () => {
  const { checkRateLimit } = await loadWithRedis();
  limitMock.mockResolvedValue({ success: false });
  expect(await checkRateLimit("dish-ai:u1", 20, 60_000)).toBe(false);
});

// If Upstash is down we must not hard-fail the user's request, but we also must not
// wave everyone through — the in-memory budget still applies.
test("an unreachable Redis degrades to the in-memory limiter", async () => {
  const { checkRateLimit } = await loadWithRedis();
  // Reject lazily: mockRejectedValue builds the rejected promise up front, which
  // Node flags as unhandled before checkRateLimit ever gets to await it.
  limitMock.mockImplementation(() => Promise.reject(new Error("ECONNRESET")));

  expect(await checkRateLimit("purchase:u1", 2, 60_000)).toBe(true);
  expect(await checkRateLimit("purchase:u1", 2, 60_000)).toBe(true);
  expect(await checkRateLimit("purchase:u1", 2, 60_000)).toBe(false);
});

test("without Redis configured, it uses the in-memory limiter", async () => {
  const { checkRateLimit, isDistributedRateLimit } = await loadWithoutRedis();
  expect(isDistributedRateLimit).toBe(false);

  expect(await checkRateLimit("signin:a@b.c", 1, 60_000)).toBe(true);
  expect(await checkRateLimit("signin:a@b.c", 1, 60_000)).toBe(false);
  expect(limitMock).not.toHaveBeenCalled();
});
