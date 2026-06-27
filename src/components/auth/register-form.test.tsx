import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@/app/(auth)/actions", () => ({ signUp: vi.fn(), signInWithGoogle: vi.fn() }));

import { RegisterForm } from "./register-form";

test("renders name, email, password fields and a submit button", () => {
  render(<RegisterForm />);
  expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
});

test("shows the Google button when enabled", () => {
  render(<RegisterForm googleEnabled />);
  expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
});

test("hides the Google button when not enabled", () => {
  render(<RegisterForm />);
  expect(screen.queryByRole("button", { name: /continue with google/i })).not.toBeInTheDocument();
});
