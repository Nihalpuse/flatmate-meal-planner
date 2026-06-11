import { expect, test } from "vitest";

import { missingIngredients, toDateString } from "./sessions";

test("missingIngredients is a case-insensitive set difference", () => {
  expect(missingIngredients(["Paneer", "Tomato"], ["tomato", "onion"])).toEqual(["Paneer"]);
  expect(missingIngredients(["rice"], ["Rice"])).toEqual([]);
});

test("missingIngredients tolerates plural/singular and whitespace differences", () => {
  expect(missingIngredients(["tomatoes"], ["Tomato"])).toEqual([]);
  expect(missingIngredients(["egg"], ["eggs"])).toEqual([]);
  expect(missingIngredients(["chillies"], ["chilly"])).toEqual([]);
  expect(missingIngredients(["green  chilli"], ["green chilli"])).toEqual([]);
  expect(missingIngredients(["paneer"], ["peas"])).toEqual(["paneer"]);
});

test("toDateString formats Y-M-D in the given timezone", () => {
  // 20:00 UTC on Jun 5 is already Jun 6, 01:30 in Kolkata.
  const d = new Date("2026-06-05T20:00:00Z");
  expect(toDateString(d, "Asia/Kolkata")).toBe("2026-06-06");
  expect(toDateString(d, "UTC")).toBe("2026-06-05");
});
