import { beforeEach, expect, test } from "vitest";

import { rateLimit, resetRateLimits } from "./rate-limit";

beforeEach(() => resetRateLimits());

test("allows up to the limit within a window", () => {
  expect(rateLimit("k", 2, 1000, 0)).toBe(true);
  expect(rateLimit("k", 2, 1000, 10)).toBe(true);
  expect(rateLimit("k", 2, 1000, 20)).toBe(false);
});

test("window expiry resets the budget", () => {
  expect(rateLimit("k", 1, 1000, 0)).toBe(true);
  expect(rateLimit("k", 1, 1000, 999)).toBe(false);
  expect(rateLimit("k", 1, 1000, 1000)).toBe(true);
});

test("keys are independent", () => {
  expect(rateLimit("a", 1, 1000, 0)).toBe(true);
  expect(rateLimit("b", 1, 1000, 0)).toBe(true);
});
