"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { createGroupForUser, joinGroupForUser } from "@/lib/groups";

export type OnboardingState = { error?: string };

export async function createGroup(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Group name is required" };

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  try {
    await createGroupForUser(session.user.id, name);
  } catch {
    return { error: "Could not create group. Please try again." };
  }
  redirect("/dashboard");
}

export async function joinGroup(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Invite code is required" };

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  let groupId: string | null;
  try {
    groupId = await joinGroupForUser(session.user.id, code);
  } catch {
    return { error: "Could not join group. Please try again." };
  }
  if (!groupId) return { error: "No group found for that code" };

  redirect("/dashboard");
}
