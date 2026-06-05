import { expect, test } from "vitest";

import { signInSchema, signUpSchema } from "./validation";

test("signInSchema accepts valid credentials", () => {
  const r = signInSchema.safeParse({ email: "a@b.com", password: "secret" });
  expect(r.success).toBe(true);
});

test("signInSchema rejects a bad email", () => {
  const r = signInSchema.safeParse({ email: "nope", password: "secret" });
  expect(r.success).toBe(false);
});

test("signUpSchema requires an 8+ char password", () => {
  const r = signUpSchema.safeParse({ name: "Sam", email: "a@b.com", password: "short" });
  expect(r.success).toBe(false);
});

test("signUpSchema requires a name", () => {
  const r = signUpSchema.safeParse({ name: "", email: "a@b.com", password: "longenough" });
  expect(r.success).toBe(false);
});
