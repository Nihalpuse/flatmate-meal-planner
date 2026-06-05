import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { HistoryView } from "./history-view";

test("renders meals grouped by date with meal-type tags", () => {
  render(
    <HistoryView
      entries={[
        { mealName: "Egg Curry", date: "2026-06-05", mealType: "dinner" },
        { mealName: "Tomato Rice", date: "2026-06-05", mealType: "lunch" },
      ]}
    />,
  );
  expect(screen.getByText("Egg Curry")).toBeInTheDocument();
  expect(screen.getByText("Tomato Rice")).toBeInTheDocument();
  expect(screen.getAllByText(/lunch|dinner/i).length).toBeGreaterThanOrEqual(2);
});

test("shows an empty state", () => {
  render(<HistoryView entries={[]} />);
  expect(screen.getByText(/no meals yet/i)).toBeInTheDocument();
});
