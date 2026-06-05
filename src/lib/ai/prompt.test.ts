import { expect, test } from "vitest";

import { buildSuggestionPrompt } from "./prompt";

test("includes the meal type and available ingredients", () => {
  const p = buildSuggestionPrompt({
    availableIngredients: ["onion", "rice"],
    recentMeals: ["Rajma Rice"],
    mealType: "dinner",
  });
  expect(p).toMatch(/dinner/i);
  expect(p).toContain("onion");
  expect(p).toContain("rice");
  expect(p).toContain("Rajma Rice");
});

test("handles empty ingredient and recent lists", () => {
  const p = buildSuggestionPrompt({ availableIngredients: [], recentMeals: [], mealType: "lunch" });
  expect(p).toMatch(/lunch/i);
  expect(p).toMatch(/none/i);
});
