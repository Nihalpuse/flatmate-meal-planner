import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
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

  if (!user) {
    redirect("/login");
  }

  // Group name is hardcoded until Plan 2 (Auth & Onboarding) wires real groups.
  return <AppShell groupName="Flat 302">{children}</AppShell>;
}
