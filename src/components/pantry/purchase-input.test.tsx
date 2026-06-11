import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

const { parsePurchaseText } = vi.hoisted(() => ({ parsePurchaseText: vi.fn() }));
vi.mock("@/app/(protected)/pantry/actions", () => ({ parsePurchaseText }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { PurchaseInput } from "./purchase-input";

test("parsing success hands items to onParsed", async () => {
  const items = [{ name: "milk" }];
  parsePurchaseText.mockResolvedValue({ items });
  const onParsed = vi.fn();
  render(<PurchaseInput onParsed={onParsed} onClose={vi.fn()} />);

  await userEvent.type(screen.getByLabelText(/what did you buy/i), "some milk");
  await userEvent.click(screen.getByRole("button", { name: /^parse/i }));

  expect(parsePurchaseText).toHaveBeenCalledWith("some milk");
  expect(onParsed).toHaveBeenCalledWith(items);
});

test("error keeps the modal open and does not call onParsed", async () => {
  parsePurchaseText.mockResolvedValue({ error: "Couldn't find any items — try rephrasing." });
  const onParsed = vi.fn();
  render(<PurchaseInput onParsed={onParsed} onClose={vi.fn()} />);

  await userEvent.type(screen.getByLabelText(/what did you buy/i), "asdf");
  await userEvent.click(screen.getByRole("button", { name: /^parse/i }));

  expect(onParsed).not.toHaveBeenCalled();
  expect(screen.getByText(/try rephrasing/i)).toBeInTheDocument();
});
