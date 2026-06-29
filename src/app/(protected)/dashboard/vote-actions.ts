"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getGroupContext } from "@/lib/groups";
import { castVoteForUser, clearVoteForUser, finalizeSessionForGroup } from "@/lib/votes";

export type VoteState = { error?: string };

export async function castVote(
  sessionId: string,
  suggestionId: string,
): Promise<VoteState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const group = await getGroupContext(session.user.id);
  if (!group) redirect("/onboarding");

  const error = await castVoteForUser(session.user.id, group.id, sessionId, suggestionId);
  if (error) return { error };
  revalidatePath("/dashboard");
  return {};
}

export async function clearVote(sessionId: string): Promise<VoteState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const group = await getGroupContext(session.user.id);
  if (!group) redirect("/onboarding");

  const error = await clearVoteForUser(session.user.id, group.id, sessionId);
  if (error) return { error };
  revalidatePath("/dashboard");
  return {};
}

export async function finalizeSession(sessionId: string): Promise<VoteState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const group = await getGroupContext(session.user.id);
  if (!group) redirect("/onboarding");

  const error = await finalizeSessionForGroup(
    session.user.id,
    group.id,
    group.role === "admin",
    sessionId,
  );
  if (error) return { error };
  revalidatePath("/dashboard");
  return {};
}
