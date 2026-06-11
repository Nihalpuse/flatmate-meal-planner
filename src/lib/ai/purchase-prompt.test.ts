import { expect, test } from "vitest";

import { buildPurchasePrompt } from "./purchase-prompt";

test("includes the user's text and the key extraction rules", () => {
  const p = buildPurchasePrompt("2kg potatoes, a dozen eggs, some milk");
  expect(p).toContain("2kg potatoes, a dozen eggs, some milk");
  expect(p).toMatch(/lowercase/i);
  expect(p).toMatch(/omit it when not stated/i);
  expect(p).toMatch(/dozen/i); // count-word expansion instruction
});
