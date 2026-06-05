import { expect, test } from "vitest";

import { missingIngredients, toDateString } from "./sessions";

test("missingIngredients is a case-insensitive set difference", () => {
  expect(missingIngredients(["Paneer", "Tomato"], ["tomato", "onion"])).toEqual(["Paneer"]);
  expect(missingIngredients(["rice"], ["Rice"])).toEqual([]);
});

test("toDateString formats local Y-M-D", () => {
  expect(toDateString(new Date(2026, 5, 5))).toBe("2026-06-05");
});
