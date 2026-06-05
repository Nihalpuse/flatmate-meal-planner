import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system", setTheme: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/app/(auth)/actions", () => ({ signOut: vi.fn() }));

import { SettingsView } from "./settings-view";

const settings = {
  id: "g", name: "Flat 302", inviteCode: "ABC123", role: "admin" as const,
  members: [
    { id: "1", name: "Sam", role: "admin" as const, isYou: true },
    { id: "2", name: "Riya", role: "member" as const, isYou: false },
  ],
};

test("shows group name, invite code, members, and logout", () => {
  render(<SettingsView settings={settings} />);
  expect(screen.getByText("Flat 302")).toBeInTheDocument();
  expect(screen.getByText("ABC123")).toBeInTheDocument();
  expect(screen.getByText("Sam")).toBeInTheDocument();
  expect(screen.getByText("Riya")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
});
