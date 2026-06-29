import { expect, test } from "vitest";

import { buildDishPrompt } from "./dish-prompt";

test("includes the dish name and asks for lowercase ingredient list", () => {
  const p = buildDishPrompt("Paneer Tikka");
  expect(p).toContain("Paneer Tikka");
  expect(p).toMatch(/lowercase/i);
  expect(p).toMatch(/ingredient/i);
});
