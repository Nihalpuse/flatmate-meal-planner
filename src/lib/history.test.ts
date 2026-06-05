import { expect, test } from "vitest";

import { groupHistoryByDate } from "./history";

test("groups entries by date preserving order", () => {
  const entries = [
    { mealName: "Egg Curry", date: "2026-06-05", mealType: "dinner" as const },
    { mealName: "Tomato Rice", date: "2026-06-05", mealType: "lunch" as const },
    { mealName: "Dal", date: "2026-06-04", mealType: "dinner" as const },
  ];
  const days = groupHistoryByDate(entries);
  expect(days.map((d) => d.date)).toEqual(["2026-06-05", "2026-06-04"]);
  expect(days[0].meals).toHaveLength(2);
  expect(days[1].meals[0].mealName).toBe("Dal");
});

test("returns [] for no entries", () => {
  expect(groupHistoryByDate([])).toEqual([]);
});
