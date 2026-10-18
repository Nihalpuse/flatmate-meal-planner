import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { RecipeShowcase } from "./recipe-showcase";

test("renders recipe title and dietary tags", () => {
  render(<RecipeShowcase />);
  expect(screen.getByText(/Crispy Tofu Rainbow Bowls/i)).toBeInTheDocument();
  expect(screen.getByText(/Pantry Match/i)).toBeInTheDocument();
  expect(screen.getByText(/Flatmates Agree/i)).toBeInTheDocument();
});

test("navigates to next and previous recipe", async () => {
  render(<RecipeShowcase />);
  const nextBtn = screen.getByRole("button", { name: /next recipe/i });
  await userEvent.click(nextBtn);

  expect(screen.getByText(/Creamy Garlic Tuscan Salmon/i)).toBeInTheDocument();

  const prevBtn = screen.getByRole("button", { name: /previous recipe/i });
  await userEvent.click(prevBtn);

  expect(screen.getByText(/Crispy Tofu Rainbow Bowls/i)).toBeInTheDocument();
});
