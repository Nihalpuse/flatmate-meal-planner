import { expect, test } from "vitest";

import { buildVoteState } from "./votes";

const sug = (id: string, sessionId: string, name: string) => ({
  id,
  sessionId,
  mealName: name,
  requiredIngredients: [] as string[],
});

test("groups suggestions and votes per session, flags my vote", () => {
  const state = buildVoteState(
    ["s1", "s2"],
    [sug("a", "s1", "Rice"), sug("b", "s1", "Dal"), sug("c", "s2", "Poha")],
    [
      { sessionId: "s1", suggestionId: "a", userId: "me" },
      { sessionId: "s1", suggestionId: "a", userId: "other" },
      { sessionId: "s2", suggestionId: "c", userId: "other" },
    ],
    "me",
  );
  const s1 = state.get("s1")!;
  expect(s1.totalVoters).toBe(2);
  expect(s1.suggestions.find((s) => s.id === "a")).toMatchObject({ votes: 2, mine: true });
  expect(s1.suggestions.find((s) => s.id === "b")).toMatchObject({ votes: 0, mine: false });
  expect(state.get("s2")!.totalVoters).toBe(1);
});

test("sessions with no suggestions still get an empty state", () => {
  const state = buildVoteState(["s1"], [], [], "me");
  expect(state.get("s1")).toEqual({ suggestions: [], totalVoters: 0 });
});
