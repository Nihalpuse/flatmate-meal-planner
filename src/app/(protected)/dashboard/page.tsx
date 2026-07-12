import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DashboardView, type SessionBundle } from "@/components/dashboard/dashboard-view";
import { getGroupContext } from "@/lib/groups";
import { getAvailableIngredientNames, getOrCreateTodaySessions } from "@/lib/sessions";
import { getFinalizedMealsForSessions, getVoteStateForSessions } from "@/lib/votes";
import type { MealSession } from "@/db/schema";

export default async function DashboardPage() {
  const authed = await auth();
  if (!authed?.user?.id) redirect("/login");
  const userId = authed.user.id;

  const group = await getGroupContext(userId);
  if (!group) redirect("/onboarding");

  // The pantry list is keyed on the group, not the sessions — fetch it alongside
  // the session bootstrap rather than waiting on it.
  const [{ lunch, dinner }, available] = await Promise.all([
    getOrCreateTodaySessions(group.id, group.timezone),
    getAvailableIngredientNames(group.id),
  ]);

  const ids = [lunch.id, dinner.id];
  const [voteStates, finalized] = await Promise.all([
    getVoteStateForSessions(ids, userId),
    getFinalizedMealsForSessions(ids),
  ]);

  const bundle = (session: MealSession): SessionBundle => ({
    session,
    suggestions: voteStates.get(session.id)?.suggestions ?? [],
    totalVoters: voteStates.get(session.id)?.totalVoters ?? 0,
    finalized: finalized.get(session.id) ?? null,
  });

  return (
    <DashboardView
      available={available}
      isAdmin={group.role === "admin"}
      currentUserId={userId}
      memberCount={group.memberCount}
      lunch={bundle(lunch)}
      dinner={bundle(dinner)}
    />
  );
}
