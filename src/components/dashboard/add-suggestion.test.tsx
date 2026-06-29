import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

const { searchDishesAction, addSuggestionFromCatalog, addSuggestionWithAI } = vi.hoisted(() => ({
  searchDishesAction: vi.fn(),
  addSuggestionFromCatalog: vi.fn().mockResolvedValue({}),
  addSuggestionWithAI: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/app/(protected)/dashboard/suggestion-actions", () => ({
  searchDishesAction,
  addSuggestionFromCatalog,
  addSuggestionWithAI,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AddSuggestion } from "./add-suggestion";

test("opens, searches, and adds a catalog match", async () => {
  searchDishesAction.mockResolvedValue([{ id: "d1", name: "Poha" }]);
  render(<AddSuggestion sessionId="s1" />);
  await userEvent.click(screen.getByRole("button", { name: /add a dish/i }));
  await userEvent.type(screen.getByRole("combobox"), "poha");
  const opt = await screen.findByRole("button", { name: /poha/i });
  await userEvent.click(opt);
  expect(addSuggestionFromCatalog).toHaveBeenCalledWith("s1", "d1");
});

test("offers AI fallback when no exact match", async () => {
  searchDishesAction.mockResolvedValue([]);
  render(<AddSuggestion sessionId="s1" />);
  await userEvent.click(screen.getByRole("button", { name: /add a dish/i }));
  await userEvent.type(screen.getByRole("combobox"), "Paneer Tikka");
  const aiRow = await screen.findByRole("button", { name: /search .*paneer tikka.* with ai/i });
  await userEvent.click(aiRow);
  expect(addSuggestionWithAI).toHaveBeenCalledWith("s1", "Paneer Tikka");
});
