"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { createGroupForUser, joinGroupForUser } from "@/lib/groups";
import { checkRateLimit } from "@/lib/rate-limit";

export type OnboardingState = { error?: string };

/**
 * The layouts redirect unverified users away, but a Server Action is a callable
 * endpoint — a redirect in the page it was rendered from does not guard it. Both
 * actions re-check here, which is the check that actually holds.
 */
async function requireVerifiedUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!session.user.emailConfirmed) redirect("/verify-email");
  return session.user.id;
}

export async function createGroup(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Group name is required" };

  const userId = await requireVerifiedUserId();

  let result;
  try {
    result = await createGroupForUser(userId, name);
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

  const userId = await requireVerifiedUserId();

  // Blunts invite-code brute forcing.
  if (!(await checkRateLimit(`join:${userId}`, 10, 60_000))) {
    return { error: "Too many attempts. Try again in a minute." };
  }

  let result;
  try {
    result = await joinGroupForUser(userId, code);
  } catch {
    return { error: "Could not join group. Please try again." };
  }
  if (result.error) return { error: result.error };
  redirect("/dashboard");
}
