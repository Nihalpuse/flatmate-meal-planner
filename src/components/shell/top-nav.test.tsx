import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/app/(auth)/actions", () => ({ signOut: vi.fn() }));

import { TopNav } from "./top-nav";

test("renders the brand and all destinations", () => {
  render(<TopNav groupName="Flat 302" />);
  expect(screen.getByText(/Flat 302/)).toBeInTheDocument();
  for (const label of ["Dashboard", "Pantry", "Voting", "History"]) {
    expect(screen.getByRole("link", { name: new RegExp(label, "i") })).toBeInTheDocument();
  }
});

test("marks the current route with aria-current", () => {
  render(<TopNav groupName="Flat 302" />);
  expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
