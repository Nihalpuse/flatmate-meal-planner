import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { getActiveGroup } from "@/lib/groups";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const group = await getActiveGroup(supabase);
  if (!group) redirect("/onboarding");

  return <AppShell groupName={group.name}>{children}</AppShell>;
}
