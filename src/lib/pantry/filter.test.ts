import { expect, test } from "vitest";

import { filterIngredients } from "./filter";

const make = (name: string) => ({ id: name, name }) as never;
const items = [make("Potato"), make("Onion"), make("Paneer")];

test("returns everything for an empty query", () => {
  expect(filterIngredients(items, "")).toHaveLength(3);
  expect(filterIngredients(items, "   ")).toHaveLength(3);
});

test("matches case-insensitively by substring", () => {
  expect(filterIngredients(items, "po").map((i) => i.name)).toEqual(["Potato"]);
  expect(filterIngredients(items, "an").map((i) => i.name)).toEqual(["Paneer"]);
});

test("returns nothing when no name matches", () => {
  expect(filterIngredients(items, "zzz")).toEqual([]);
});
