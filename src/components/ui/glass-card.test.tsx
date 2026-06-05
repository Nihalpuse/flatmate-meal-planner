import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { GlassCard } from "./glass-card";

test("renders children", () => {
  render(<GlassCard>Hello</GlassCard>);
  expect(screen.getByText("Hello")).toBeInTheDocument();
});

test("marks itself with the glass-card slot", () => {
  render(<GlassCard>x</GlassCard>);
  expect(document.querySelector('[data-slot="glass-card"]')).not.toBeNull();
});

test("merges a custom className", () => {
  render(<GlassCard className="custom-x">x</GlassCard>);
  expect(document.querySelector('[data-slot="glass-card"]')).toHaveClass("custom-x");
});
