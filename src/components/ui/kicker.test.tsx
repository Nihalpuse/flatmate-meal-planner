import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Kicker } from "./kicker";

test("renders uppercase mono label text", () => {
  render(<Kicker>Leading</Kicker>);
  const el = screen.getByText("Leading");
  expect(el).toBeInTheDocument();
  expect(el).toHaveClass("uppercase");
});

test("solid variant applies the accent background", () => {
  render(<Kicker variant="solid">Dinner</Kicker>);
  expect(screen.getByText("Dinner")).toHaveClass("bg-primary");
});
