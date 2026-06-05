import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

vi.mock("@/app/(protected)/dashboard/actions", () => ({ generateSuggestions: vi.fn() }));

import { DashboardView } from "./dashboard-view";

const sess = (id: string) => ({
  id, groupId: "g", sessionDate: "2026-06-05", mealType: "lunch" as const, status: "open" as const, createdAt: new Date(),
});
const sug = (id: string, name: string, req: string[]) => ({
  id, sessionId: "l", mealName: name, aiGenerated: true, requiredIngredients: req, createdAt: new Date(),
});

const props = {
  available: ["rice", "egg"],
  lunch: { session: sess("l"), suggestions: [sug("1", "Egg Fried Rice", ["egg", "rice"]), sug("2", "Paneer Masala", ["paneer", "cream"])] },
  dinner: { session: { ...sess("d"), mealType: "dinner" as const }, suggestions: [] },
};

test("shows lunch suggestions with a missing-ingredient flag", () => {
  render(<DashboardView {...props} />);
  expect(screen.getByText("Egg Fried Rice")).toBeInTheDocument();
  expect(screen.getByText("Paneer Masala")).toBeInTheDocument();
  expect(screen.getByText(/needs paneer/i)).toBeInTheDocument();
});

test("switches to the dinner tab and shows its empty state", async () => {
  render(<DashboardView {...props} />);
  await userEvent.click(screen.getByRole("tab", { name: /dinner/i }));
  expect(screen.getByText(/no suggestions yet/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /generate/i })).toBeInTheDocument();
});
