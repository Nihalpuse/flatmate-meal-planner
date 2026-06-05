import { z } from "zod";

const optionalQuantity = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z
    .number({ message: "Quantity must be a number" })
    .nonnegative("Quantity can't be negative")
    .optional(),
);

const optionalUnit = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined),
  z.string().max(20).optional(),
);

export const ingredientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  quantity: optionalQuantity,
  unit: optionalUnit,
});

export type IngredientInput = z.infer<typeof ingredientSchema>;
