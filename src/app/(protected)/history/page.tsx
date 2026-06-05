import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { HistoryView } from "@/components/history/history-view";
import { getActiveGroup } from "@/lib/groups";
import { getMealHistory } from "@/lib/history";

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const group = await getActiveGroup(session.user.id);
  if (!group) redirect("/onboarding");

  const entries = await getMealHistory(group.id);
  return <HistoryView entries={entries} />;
}
