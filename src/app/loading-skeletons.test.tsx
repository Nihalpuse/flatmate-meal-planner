import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";

import DashboardLoading from "./(protected)/dashboard/loading";
import HistoryLoading from "./(protected)/history/loading";
import PantryLoading from "./(protected)/pantry/loading";
import SettingsLoading from "./(protected)/settings/loading";

// A <section> only exposes role="region" once it has an accessible name — without
// one it is a generic div, and the aria-busy state never reaches assistive tech.
// Querying by role is what pins that: drop the aria-label and these fail.
const skeletons = [
  { name: "dashboard", Component: DashboardLoading, label: /loading dashboard/i, rows: 5 },
  { name: "pantry", Component: PantryLoading, label: /loading pantry/i, rows: 5 },
  { name: "history", Component: HistoryLoading, label: /loading history/i, rows: 4 },
  { name: "settings", Component: SettingsLoading, label: /loading settings/i, rows: 6 },
];

test.each(skeletons)(
  "$name skeleton is a named busy region with placeholder rows",
  ({ Component, label, rows }) => {
    const { container } = render(<Component />);

    expect(screen.getByRole("region", { busy: true, name: label })).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(rows);
  },
);
