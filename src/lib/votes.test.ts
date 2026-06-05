import { expect, test } from "vitest";

import { pickWinner } from "./votes";

const row = (id: string, votes: number, order: number) => ({
  id,
  votes,
  createdAt: new Date(2026, 0, 1, 0, order),
});

test("returns the most-voted suggestion", () => {
  expect(pickWinner([row("a", 1, 0), row("b", 3, 1), row("c", 2, 2)])).toBe("b");
});

test("breaks ties by earliest created", () => {
  expect(pickWinner([row("a", 2, 1), row("b", 2, 0)])).toBe("b");
});

test("returns null when there are no votes at all", () => {
  expect(pickWinner([row("a", 0, 0), row("b", 0, 1)])).toBeNull();
});

test("returns null for an empty list", () => {
  expect(pickWinner([])).toBeNull();
});
