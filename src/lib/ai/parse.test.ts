import { expect, test } from "vitest";

import { parseSuggestions } from "./parse";

test("parses valid suggestions and lowercases ingredients", () => {
  const json = JSON.stringify([
    { mealName: "Egg Fried Rice", requiredIngredients: ["Egg", "Rice"] },
  ]);
  const out = parseSuggestions(json);
  expect(out).toEqual([{ mealName: "Egg Fried Rice", requiredIngredients: ["egg", "rice"] }]);
});

test("skips invalid items and returns [] on bad JSON", () => {
  expect(parseSuggestions("not json")).toEqual([]);
  const mixed = JSON.stringify([{ mealName: "" }, { mealName: "Dal", requiredIngredients: ["dal"] }]);
  expect(parseSuggestions(mixed)).toEqual([{ mealName: "Dal", requiredIngredients: ["dal"] }]);
});

test("respects the limit", () => {
  const arr = Array.from({ length: 8 }, (_, i) => ({ mealName: `M${i}`, requiredIngredients: [] }));
  expect(parseSuggestions(JSON.stringify(arr), 5)).toHaveLength(5);
});
