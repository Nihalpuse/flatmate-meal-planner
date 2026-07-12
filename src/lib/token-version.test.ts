import { expect, test } from "vitest";

import { isTokenVersionCurrent } from "./token-version";

test("a token stamped with the user's current version is accepted", () => {
  expect(isTokenVersionCurrent(3, 3)).toBe(true);
});

test("a token stamped before a revocation is rejected", () => {
  expect(isTokenVersionCurrent(2, 3)).toBe(false);
});

// The user row is gone, so nothing can vouch for the token. Fail closed.
test("a token for a deleted user is rejected", () => {
  expect(isTokenVersionCurrent(0, null)).toBe(false);
  expect(isTokenVersionCurrent(undefined, null)).toBe(false);
});

// Tokens issued before this feature shipped carry no version. Treating them as 0
// grandfathers them in rather than force-logging out every user on deploy — safely,
// since 0 is what their user row already holds, and any revocation bumps past it.
test("a token minted before versioning existed is treated as version 0", () => {
  expect(isTokenVersionCurrent(undefined, 0)).toBe(true);
  expect(isTokenVersionCurrent(undefined, 1)).toBe(false);
});
