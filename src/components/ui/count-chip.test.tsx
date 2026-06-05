import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { CountChip } from "./count-chip";

test("shows the count", () => {
  render(<CountChip count={3} />);
  expect(screen.getByText("3")).toBeInTheDocument();
});

test("uses the muted style when count is zero", () => {
  render(<CountChip count={0} />);
  expect(screen.getByText("0")).toHaveClass("bg-muted");
});

test("uses the solid accent style when count is positive", () => {
  render(<CountChip count={2} />);
  expect(screen.getByText("2")).toHaveClass("bg-primary");
});
