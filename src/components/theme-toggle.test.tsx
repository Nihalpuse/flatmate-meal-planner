import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

const setTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme }),
}));

import { ThemeToggle } from "./theme-toggle";

test("renders an accessible toggle button", () => {
  render(<ThemeToggle />);
  expect(screen.getByRole("button", { name: /toggle theme/i })).toBeInTheDocument();
});

test("switches from light to dark on click", async () => {
  render(<ThemeToggle />);
  await userEvent.click(screen.getByRole("button", { name: /toggle theme/i }));
  expect(setTheme).toHaveBeenCalledWith("dark");
});
