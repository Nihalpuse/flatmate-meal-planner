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

  const { lunch, dinner } = await getOrCreateTodaySessions(group.id, group.timezone);
  const ids = [lunch.id, dinner.id];
  const [voteStates, finalized, available] = await Promise.all([
    getVoteStateForSessions(ids, userId),
    getFinalizedMealsForSessions(ids),
    getAvailableIngredientNames(group.id),
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
