import { expect, test } from "vitest";

import { ingredientSchema } from "./validation";

test("accepts a name-only ingredient", () => {
  expect(ingredientSchema.safeParse({ name: "Salt" }).success).toBe(true);
});

test("accepts name + quantity + unit", () => {
  const r = ingredientSchema.safeParse({ name: "Rice", quantity: "5", unit: "kg" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.quantity).toBe(5);
});

test("rejects an empty name", () => {
  expect(ingredientSchema.safeParse({ name: "  " }).success).toBe(false);
});

test("rejects a negative quantity", () => {
  expect(ingredientSchema.safeParse({ name: "Rice", quantity: "-2" }).success).toBe(false);
});

test("rejects a non-numeric quantity", () => {
  expect(ingredientSchema.safeParse({ name: "Rice", quantity: "abc" }).success).toBe(false);
});

test("treats empty quantity/unit as undefined", () => {
  const r = ingredientSchema.safeParse({ name: "Salt", quantity: "", unit: "" });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.quantity).toBeUndefined();
    expect(r.data.unit).toBeUndefined();
  }
});
