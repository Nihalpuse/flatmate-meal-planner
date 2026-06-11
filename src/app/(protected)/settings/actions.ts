"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  leaveGroupForUser,
  promoteMemberToAdmin,
  removeMemberFromGroup,
  rotateGroupInviteCode,
} from "@/lib/groups";

export type SettingsActionState = { error?: string };

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
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
