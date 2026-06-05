import { expect, test } from "vitest";

import { NAV_ITEMS, isActive } from "./nav";

test("exposes the four core destinations in order", () => {
  expect(NAV_ITEMS.map((i) => i.href)).toEqual([
    "/dashboard",
    "/pantry",
    "/history",
    "/settings",
  ]);
});

test("exact match is active", () => {
  expect(isActive("/pantry", "/pantry")).toBe(true);
});

test("nested route activates its parent tab", () => {
  expect(isActive("/voting/lunch", "/voting")).toBe(true);
});

test("unrelated route is not active", () => {
  expect(isActive("/history", "/pantry")).toBe(false);
});
