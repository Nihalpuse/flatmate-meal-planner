import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

vi.mock("@/app/(protected)/pantry/actions", () => ({
  saveIngredient: vi.fn(),
  deleteIngredient: vi.fn(),
  setAvailability: vi.fn(),
}));

import { PantryView } from "./pantry-view";

const ings = [
  { id: "1", group_id: "g", name: "Potato", quantity: 2, unit: "kg", available: true, created_at: "", updated_at: "" },
  { id: "2", group_id: "g", name: "Onion", quantity: 1, unit: "kg", available: true, created_at: "", updated_at: "" },
];

test("lists ingredients and the add button", () => {
  render(<PantryView ingredients={ings} />);
  expect(screen.getByRole("heading", { name: /pantry/i })).toBeInTheDocument();
  expect(screen.getByText("Potato")).toBeInTheDocument();
  expect(screen.getByText("Onion")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
});

test("filters the list as you search", async () => {
  render(<PantryView ingredients={ings} />);
  await userEvent.type(screen.getByLabelText(/search ingredients/i), "pot");
  expect(screen.getByText("Potato")).toBeInTheDocument();
  expect(screen.queryByText("Onion")).not.toBeInTheDocument();
});

test("opens the add sheet from the add button", async () => {
  render(<PantryView ingredients={ings} />);
  await userEvent.click(screen.getByRole("button", { name: /add/i }));
  expect(screen.getByRole("dialog", { name: /add ingredient/i })).toBeInTheDocument();
});

test("shows an empty state with no ingredients", () => {
  render(<PantryView ingredients={[]} />);
  expect(screen.getByText(/no ingredients yet/i)).toBeInTheDocument();
});
