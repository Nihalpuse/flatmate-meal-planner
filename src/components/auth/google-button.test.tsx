import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

const { signInWithGoogle } = vi.hoisted(() => ({ signInWithGoogle: vi.fn() }));
vi.mock("@/app/(auth)/actions", () => ({ signInWithGoogle }));

import { GoogleButton } from "./google-button";

test("renders and triggers the Google sign-in action", async () => {
  render(<GoogleButton />);
  const btn = screen.getByRole("button", { name: /continue with google/i });
  expect(btn).toBeInTheDocument();
  await userEvent.click(btn);
  expect(signInWithGoogle).toHaveBeenCalled();
});
