import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SettingsView } from "@/components/settings/settings-view";
import { getGroupSettings } from "@/lib/settings";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const settings = await getGroupSettings(session.user.id);
  if (!settings) redirect("/onboarding");

  return <SettingsView settings={settings} />;
}
