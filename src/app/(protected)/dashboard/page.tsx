import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getActiveGroup } from "@/lib/groups";
import {
  getAvailableIngredientNames,
  getOrCreateTodaySessions,
  getSessionSuggestions,
} from "@/lib/sessions";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const group = await getActiveGroup(session.user.id);
  if (!group) redirect("/onboarding");

  const { lunch, dinner } = await getOrCreateTodaySessions(group.id);
  const [lunchSuggestions, dinnerSuggestions, available] = await Promise.all([
    getSessionSuggestions(lunch.id),
    getSessionSuggestions(dinner.id),
    getAvailableIngredientNames(group.id),
  ]);

  return (
    <DashboardView
      available={available}
      lunch={{ session: lunch, suggestions: lunchSuggestions }}
      dinner={{ session: dinner, suggestions: dinnerSuggestions }}
    />
  );
}
