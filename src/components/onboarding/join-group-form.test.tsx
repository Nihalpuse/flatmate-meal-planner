import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@/app/onboarding/actions", () => ({ joinGroup: vi.fn() }));

import { JoinGroupForm } from "./join-group-form";

test("renders an invite-code field and a join button", () => {
  render(<JoinGroupForm />);
  expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /join/i })).toBeInTheDocument();
});
