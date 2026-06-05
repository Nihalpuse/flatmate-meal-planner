import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@/app/onboarding/actions", () => ({ createGroup: vi.fn() }));

import { CreateGroupForm } from "./create-group-form";

test("renders a group-name field and a create button", () => {
  render(<CreateGroupForm />);
  expect(screen.getByLabelText(/group name/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /create group/i })).toBeInTheDocument();
});
