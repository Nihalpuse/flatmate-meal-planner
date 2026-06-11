import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

const { addPurchasedItems } = vi.hoisted(() => ({
  addPurchasedItems: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/app/(protected)/pantry/actions", () => ({ addPurchasedItems }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { Ingredient } from "@/db/schema";
import { PurchaseReview } from "./purchase-review";

const existing: Ingredient[] = [
  {
    id: "i1", groupId: "g", name: "rice", quantity: 1, unit: "kg",
    available: true, createdAt: new Date(), updatedAt: new Date(),
  },
];

const items = [
  { name: "rice", quantity: 2, unit: "kg" },
  { name: "potato", quantity: 3, unit: "kg" },
];

function setup() {
  const onClose = vi.fn();
  render(<PurchaseReview items={items} existing={existing} onClose={onClose} />);
  return { onClose };
}

test("renders a row per item with merge/new flags", () => {
  setup();
  expect(screen.getByDisplayValue("rice")).toBeInTheDocument();
  expect(screen.getByDisplayValue("potato")).toBeInTheDocument();
  expect(screen.getByText(/have 1/i)).toBeInTheDocument(); // merge preview for rice
});

test("plus button increments the quantity (0.5 step for weight units)", async () => {
  setup();
  const riceRow = screen.getByTestId("review-row-0");
  await userEvent.click(within(riceRow).getByRole("button", { name: /increase/i }));
  expect(within(riceRow).getByLabelText("Quantity")).toHaveValue(2.5);
});

test("removing a row drops it", async () => {
  setup();
  await userEvent.click(
    within(screen.getByTestId("review-row-1")).getByRole("button", { name: /remove/i }),
  );
  expect(screen.queryByDisplayValue("potato")).not.toBeInTheDocument();
});

test("confirm sends the edited rows", async () => {
  const { onClose } = setup();
  await userEvent.click(screen.getByRole("button", { name: /add to pantry/i }));
  expect(addPurchasedItems).toHaveBeenCalledWith([
    { name: "rice", quantity: 2, unit: "kg" },
    { name: "potato", quantity: 3, unit: "kg" },
  ]);
  expect(onClose).toHaveBeenCalled();
});
