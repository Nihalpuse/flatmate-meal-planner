"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth, signOut as authSignOut } from "@/auth";
import {
  leaveGroupForUser,
  promoteMemberToAdmin,
  removeMemberFromGroup,
  rotateGroupInviteCode,
} from "@/lib/groups";
import { revokeUserSessions } from "@/lib/token-version";

export type SettingsActionState = { error?: string };

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

/**
 * Invalidate every session this user has anywhere, including the current one.
 *
 * Bumping the token version is what actually revokes them: the JWTs already out there
 * still decrypt, but their stamped version no longer matches, so auth() rejects them
 * on the next request. signOut then clears this device's cookie and redirects.
 */
export async function signOutEverywhere(): Promise<SettingsActionState> {
  const userId = await requireUserId();
  await revokeUserSessions(userId);
  await authSignOut({ redirectTo: "/login" });
  return {};
}

export async function leaveGroup(): Promise<SettingsActionState> {
  const userId = await requireUserId();
  const error = await leaveGroupForUser(userId);
  if (error) return { error };
  redirect("/onboarding");
}

export async function removeMember(targetUserId: string): Promise<SettingsActionState> {
  const userId = await requireUserId();
  const error = await removeMemberFromGroup(userId, targetUserId);
  if (error) return { error };
  revalidatePath("/settings");
  return {};
}

export async function promoteMember(targetUserId: string): Promise<SettingsActionState> {
  const userId = await requireUserId();
  const error = await promoteMemberToAdmin(userId, targetUserId);
  if (error) return { error };
  revalidatePath("/settings");
  return {};
}

export async function rotateInviteCode(): Promise<SettingsActionState> {
  const userId = await requireUserId();
  const result = await rotateGroupInviteCode(userId);
  if (result.error) return { error: result.error };
  revalidatePath("/settings");
  return {};
}
