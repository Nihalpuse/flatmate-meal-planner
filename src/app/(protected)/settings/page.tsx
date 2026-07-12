import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SettingsView } from "@/components/settings/settings-view";
import { env } from "@/env";
import { getGroupContext } from "@/lib/groups";
import { getGroupSettings } from "@/lib/settings";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Cache hit: the protected layout already resolved this for the request.
  const group = await getGroupContext(session.user.id);
  if (!group) redirect("/onboarding");

  const settings = await getGroupSettings(group, session.user.id);
  if (!settings) redirect("/onboarding");

  const inviteLink = `${env.NEXT_PUBLIC_APP_URL}/onboarding?code=${settings.inviteCode}`;
  return <SettingsView settings={settings} inviteLink={inviteLink} />;
}
