import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DashboardView, type SessionBundle } from "@/components/dashboard/dashboard-view";
import { getGroupContext } from "@/lib/groups";
import { getAvailableIngredientNames, getOrCreateTodaySessions } from "@/lib/sessions";
import { getFinalizedMeal, getSessionVoteState } from "@/lib/votes";
import type { MealSession } from "@/db/schema";

async function bundle(session: MealSession, userId: string): Promise<SessionBundle> {
  const [state, finalized] = await Promise.all([
    getSessionVoteState(session.id, userId),
    getFinalizedMeal(session.id),
  ]);
  return {
    session,
    suggestions: state.suggestions,
    totalVoters: state.totalVoters,
    finalized,
  };
}

export default async function DashboardPage() {
  const authed = await auth();
  if (!authed?.user?.id) redirect("/login");
  const userId = authed.user.id;

  const group = await getGroupContext(userId);
  if (!group) redirect("/onboarding");

  const { lunch, dinner } = await getOrCreateTodaySessions(group.id);
  const [lunchBundle, dinnerBundle, available] = await Promise.all([
    bundle(lunch, userId),
    bundle(dinner, userId),
    getAvailableIngredientNames(group.id),
  ]);

  return (
    <DashboardView
      available={available}
      isAdmin={group.role === "admin"}
      memberCount={group.memberCount}
      lunch={lunchBundle}
      dinner={dinnerBundle}
    />
  );
}
