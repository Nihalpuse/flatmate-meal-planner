import { expect, test } from "vitest";

import { parsePurchaseItems } from "./parse-purchase";

test("keeps valid items, lowercases name and unit", () => {
  const json = JSON.stringify([
    { name: "Potato", quantity: 2, unit: "KG" },
    { name: "Egg", quantity: 12, unit: "pcs" },
  ]);
  expect(parsePurchaseItems(json)).toEqual([
    { name: "potato", quantity: 2, unit: "kg" },
    { name: "egg", quantity: 12, unit: "pcs" },
  ]);
});

test("allows items with no quantity or unit (e.g. 'some milk')", () => {
  expect(parsePurchaseItems(JSON.stringify([{ name: "milk" }]))).toEqual([
    { name: "milk" },
  ]);
});

test("tolerates null quantity/unit from the model", () => {
  const json = JSON.stringify([{ name: "milk", quantity: null, unit: null }]);
  expect(parsePurchaseItems(json)).toEqual([{ name: "milk" }]);
});

test("drops invalid entries and bad JSON", () => {
  expect(parsePurchaseItems("not json")).toEqual([]);
  const json = JSON.stringify([{ name: "" }, { quantity: 3 }, { name: "rice" }]);
  expect(parsePurchaseItems(json)).toEqual([{ name: "rice" }]);
});

test("respects the limit", () => {
  const json = JSON.stringify(
    Array.from({ length: 40 }, (_, i) => ({ name: `item${i}` })),
  );
  expect(parsePurchaseItems(json, 5)).toHaveLength(5);
});
