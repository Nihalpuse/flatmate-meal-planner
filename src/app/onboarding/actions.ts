"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { createGroupForUser, joinGroupForUser } from "@/lib/groups";
import { checkRateLimit } from "@/lib/rate-limit";

export type OnboardingState = { error?: string };

export async function createGroup(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Group name is required" };

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  let result;
  try {
    result = await createGroupForUser(session.user.id, name);
  } catch {
    return { error: "Could not create group. Please try again." };
  }
  if (result.error) return { error: result.error };
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

  // Blunts invite-code brute forcing.
  if (!(await checkRateLimit(`join:${session.user.id}`, 10, 60_000))) {
    return { error: "Too many attempts. Try again in a minute." };
  }

  let result;
  try {
    result = await joinGroupForUser(session.user.id, code);
  } catch {
    return { error: "Could not join group. Please try again." };
  }
  if (result.error) return { error: result.error };
  redirect("/dashboard");
}
