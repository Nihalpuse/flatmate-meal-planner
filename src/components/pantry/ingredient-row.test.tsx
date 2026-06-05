import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@/app/(protected)/pantry/actions", () => ({
  deleteIngredient: vi.fn(),
  setAvailability: vi.fn(),
}));

import { IngredientRow } from "./ingredient-row";

const base = {
  id: "1", group_id: "g", name: "Potato", quantity: 2, unit: "kg",
  available: true, created_at: "", updated_at: "",
};

test("renders name and quantity", () => {
  render(<IngredientRow ingredient={base} onEdit={() => {}} />);
  expect(screen.getByText("Potato")).toBeInTheDocument();
  expect(screen.getByText(/2 kg/)).toBeInTheDocument();
});

test("exposes edit, delete, and availability controls", () => {
  render(<IngredientRow ingredient={base} onEdit={() => {}} />);
  expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /unavailable/i })).toBeInTheDocument();
});
