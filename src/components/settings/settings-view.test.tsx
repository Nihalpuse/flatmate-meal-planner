import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system", setTheme: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/(auth)/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/app/(protected)/settings/actions", () => ({
  leaveGroup: vi.fn().mockResolvedValue({}),
  promoteMember: vi.fn().mockResolvedValue({}),
  removeMember: vi.fn().mockResolvedValue({}),
  rotateInviteCode: vi.fn().mockResolvedValue({}),
}));

import { SettingsView } from "./settings-view";

const settings = {
  id: "g", name: "Flat 302", inviteCode: "ABC123", role: "admin" as const,
  members: [
    { id: "1", name: "Sam", role: "admin" as const, isYou: true },
    { id: "2", name: "Riya", role: "member" as const, isYou: false },
  ],
};

const link = "http://localhost:3000/onboarding?code=ABC123";

test("shows group name, invite code, members, and logout", () => {
  render(<SettingsView settings={settings} inviteLink={link} />);
  expect(screen.getByText("Flat 302")).toBeInTheDocument();
  expect(screen.getByText("ABC123")).toBeInTheDocument();
  expect(screen.getByText("Sam")).toBeInTheDocument();
  expect(screen.getByText("Riya")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
});

test("admin sees member management and rotate controls", () => {
  render(<SettingsView settings={settings} inviteLink={link} />);
  expect(screen.getByRole("button", { name: /make admin/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /rotate/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /leave group/i })).toBeInTheDocument();
});

test("member does not see admin controls", () => {
  const memberSettings = { ...settings, role: "member" as const };
  render(<SettingsView settings={memberSettings} inviteLink={link} />);
  expect(screen.queryByRole("button", { name: /make admin/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /rotate/i })).not.toBeInTheDocument();
});
