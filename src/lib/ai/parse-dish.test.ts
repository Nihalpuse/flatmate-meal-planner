import { expect, test } from "vitest";

import { parseDishIngredients } from "./parse-dish";

test("returns lowercased trimmed names, drops blanks/non-strings", () => {
  expect(parseDishIngredients('["Paneer"," Tomato ","",null,"Cream"]')).toEqual([
    "paneer", "tomato", "cream",
  ]);
});

test("bad JSON or non-array returns empty", () => {
  expect(parseDishIngredients("nope")).toEqual([]);
  expect(parseDishIngredients('{"a":1}')).toEqual([]);
});
