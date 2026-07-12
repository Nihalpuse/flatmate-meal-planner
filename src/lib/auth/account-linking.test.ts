// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

/**
 * Guards the account-takeover hole this repo used to have.
 *
 * allowDangerousEmailAccountLinking makes Google sign-in silently attach itself to
 * any existing user row with a matching email. Credentials signup does not verify
 * the address, so anyone could register victim@example.com with a password of their
 * choosing, wait for the real owner to sign in with Google, and then log into the
 * linked account using that password.
 *
 * Turning it back on is only safe once signup verifies the email — at which point
 * this test should be replaced, not deleted.
 */
test("Google provider never enables dangerous email account linking", () => {
  const source = readFileSync(join(process.cwd(), "src", "auth.ts"), "utf8");
  const enabled = /allowDangerousEmailAccountLinking\s*:\s*true/.test(source);

  expect(enabled).toBe(false);
});
