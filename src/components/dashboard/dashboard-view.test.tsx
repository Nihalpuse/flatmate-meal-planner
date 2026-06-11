import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

vi.mock("@/app/(protected)/dashboard/actions", () => ({ generateSuggestions: vi.fn() }));
vi.mock("@/app/(protected)/dashboard/vote-actions", () => ({
  castVote: vi.fn().mockResolvedValue({}),
  finalizeSession: vi.fn().mockResolvedValue({}),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { castVote } from "@/app/(protected)/dashboard/vote-actions";
import { DashboardView } from "./dashboard-view";

const sv = (id: string, name: string, req: string[], votes: number, mine = false) => ({
  id, mealName: name, requiredIngredients: req, votes, mine,
});
const sessBase = { groupId: "g", sessionDate: "2026-06-05", status: "open" as const, createdAt: new Date(), lastGeneratedAt: null };
const lunch = {
  session: { id: "l", mealType: "lunch" as const, ...sessBase },
  suggestions: [sv("1", "Egg Fried Rice", ["egg", "rice"], 2, true), sv("2", "Paneer Masala", ["paneer"], 0)],
  totalVoters: 2,
  finalized: null,
};
const dinner = {
  session: { id: "d", mealType: "dinner" as const, ...sessBase },
  suggestions: [],
  totalVoters: 0,
  finalized: null,
};

const props = { available: ["rice", "egg"], isAdmin: true, memberCount: 3, lunch, dinner };

test("shows suggestions, votes count, and progress", () => {
  render(<DashboardView {...props} />);
  expect(screen.getByText("Egg Fried Rice")).toBeInTheDocument();
  expect(screen.getByText(/2 of 3 voted/i)).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
});

test("tapping a suggestion casts a vote", async () => {
  render(<DashboardView {...props} />);
  await userEvent.click(screen.getByText("Paneer Masala"));
  expect(castVote).toHaveBeenCalledWith("l", "2");
});

test("admin sees a finalize button", () => {
  render(<DashboardView {...props} />);
  expect(screen.getByRole("button", { name: /finalize/i })).toBeInTheDocument();
});

test("finalized session shows the chosen meal and grocery list", () => {
  const finalizedProps = {
    ...props,
    lunch: {
      ...lunch,
      session: { ...lunch.session, status: "finalized" as const },
      finalized: { mealName: "Paneer Masala" },
    },
  };
  render(<DashboardView {...finalizedProps} />);
  expect(screen.getByText(/Paneer Masala/)).toBeInTheDocument();
  // grocery list line shows the exact missing ingredient ("paneer")
  expect(screen.getByText("paneer")).toBeInTheDocument();
});

test("polls for updates while a session is undecided", () => {
  vi.useFakeTimers();
  refreshMock.mockClear();
  render(<DashboardView {...props} />);
  vi.advanceTimersByTime(9000);
  expect(refreshMock).toHaveBeenCalled();
  vi.useRealTimers();
});

test("does not poll once both sessions are finalized", () => {
  vi.useFakeTimers();
  refreshMock.mockClear();
  const done = <T extends typeof lunch | typeof dinner>(b: T) => ({
    ...b,
    session: { ...b.session, status: "finalized" as const },
    finalized: { mealName: "X" },
  });
  render(<DashboardView {...props} lunch={done(lunch)} dinner={done(dinner)} />);
  vi.advanceTimersByTime(20000);
  expect(refreshMock).not.toHaveBeenCalled();
  vi.useRealTimers();
});
