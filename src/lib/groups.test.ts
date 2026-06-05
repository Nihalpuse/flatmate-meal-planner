import { expect, test, vi } from "vitest";

import { getActiveGroup } from "./groups";

function fakeSupabase(returnData: unknown) {
  const chain = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: returnData, error: null })),
  };
  return { from: vi.fn(() => chain) } as never;
}

test("returns the joined group when the user has a membership", async () => {
  const supabase = fakeSupabase({ groups: { id: "g1", name: "Flat 302" } });
  expect(await getActiveGroup(supabase)).toEqual({ id: "g1", name: "Flat 302" });
});

test("returns null when the user has no membership", async () => {
  const supabase = fakeSupabase(null);
  expect(await getActiveGroup(supabase)).toBeNull();
});
