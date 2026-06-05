import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@/app/(protected)/pantry/actions", () => ({ saveIngredient: vi.fn() }));

import { IngredientSheet } from "./ingredient-sheet";

test("renders an add form with empty fields", () => {
  render(<IngredientSheet ingredient={null} onClose={() => {}} />);
  expect(screen.getByRole("dialog", { name: /add ingredient/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/name/i)).toHaveValue("");
});

test("prefills fields when editing", () => {
  const ing = {
    id: "1", group_id: "g", name: "Rice", quantity: 5, unit: "kg",
    available: true, created_at: "", updated_at: "",
  };
  render(<IngredientSheet ingredient={ing} onClose={() => {}} />);
  expect(screen.getByRole("dialog", { name: /edit ingredient/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/name/i)).toHaveValue("Rice");
  expect(screen.getByLabelText(/unit/i)).toHaveValue("kg");
});
