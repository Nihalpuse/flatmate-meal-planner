import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@/app/(auth)/actions", () => ({ signIn: vi.fn(), signInWithGoogle: vi.fn() }));

import { LoginForm } from "./login-form";

test("renders email and password fields and a submit button", () => {
  render(<LoginForm />);
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
});

test("shows the Google button when enabled", () => {
  render(<LoginForm googleEnabled />);
  expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
});

test("hides the Google button when not enabled", () => {
  render(<LoginForm />);
  expect(screen.queryByRole("button", { name: /continue with google/i })).not.toBeInTheDocument();
});
