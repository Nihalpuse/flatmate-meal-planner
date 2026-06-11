import { expect, test } from "vitest";

import { mergePreview, resolveMergedValues } from "./merge";
import type { Ingredient } from "@/db/schema";

const ing = (over: Partial<Ingredient>): Ingredient => ({
  id: "i1",
  groupId: "g",
  name: "Rice",
  quantity: 1,
  unit: "kg",
  available: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

test("resolveMergedValues: new when no existing", () => {
  expect(resolveMergedValues(null, { quantity: 2, unit: "kg" })).toEqual({
    quantity: 2,
    unit: "kg",
    status: "new",
  });
});

test("resolveMergedValues: sums when units match (case-insensitive)", () => {
  expect(
    resolveMergedValues({ quantity: 1, unit: "KG" }, { quantity: 2, unit: "kg" }),
  ).toEqual({ quantity: 3, unit: "KG", status: "merge" });
});

test("resolveMergedValues: merges when both units empty", () => {
  expect(
    resolveMergedValues({ quantity: 1, unit: null }, { quantity: 2 }),
  ).toEqual({ quantity: 3, unit: null, status: "merge" });
});

test("resolveMergedValues: replaces when units differ or one is empty", () => {
  expect(
    resolveMergedValues({ quantity: 1, unit: "kg" }, { quantity: 2, unit: "packet" }),
  ).toEqual({ quantity: 2, unit: "packet", status: "replace" });
  expect(
    resolveMergedValues({ quantity: 5, unit: null }, { quantity: 2, unit: "kg" }),
  ).toEqual({ quantity: 2, unit: "kg", status: "replace" });
});

test("mergePreview flags rows by case-insensitive name match", () => {
  const rows = mergePreview(
    [
      { name: "rice", quantity: 2, unit: "kg" }, // matches existing "Rice" 1kg
      { name: "paneer", quantity: 1, unit: "packet" }, // new
    ],
    [ing({})],
  );
  expect(rows[0]).toMatchObject({
    name: "rice",
    status: "merge",
    existingQuantity: 1,
    resultingQuantity: 3,
  });
  expect(rows[1]).toMatchObject({ name: "paneer", status: "new", resultingQuantity: 1 });
});
