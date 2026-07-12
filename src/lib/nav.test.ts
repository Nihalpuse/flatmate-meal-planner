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

// Full prefetching buys an instant, skeleton-free navigation at the cost of a
// client cache that can lag a flatmate's edit. That trade is fine for the pantry
// and the history, and wrong for the dashboard, where a stale vote tally means the
// group cooks the wrong meal. Pinning it so the dashboard is never opted in.
test("only the routes that tolerate stale data are fully prefetched", () => {
  const prefetched = NAV_ITEMS.filter((i) => i.prefetch).map((i) => i.href);
  expect(prefetched).toEqual(["/pantry", "/history"]);

  const dashboard = NAV_ITEMS.find((i) => i.href === "/dashboard");
  expect(dashboard?.prefetch).toBeUndefined();
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
