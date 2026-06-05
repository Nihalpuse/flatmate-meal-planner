import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/pantry" }));

import { BottomTabBar } from "./bottom-tab-bar";

test("renders all four destinations", () => {
  render(<BottomTabBar />);
  for (const label of ["Dashboard", "Pantry", "History", "Settings"]) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
});

test("marks the current route with aria-current", () => {
  render(<BottomTabBar />);
  const pantry = screen.getByRole("link", { name: /pantry/i });
  expect(pantry).toHaveAttribute("aria-current", "page");
});
