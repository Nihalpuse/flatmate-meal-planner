import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppShell } from "@/components/shell/app-shell";
import { getActiveGroup } from "@/lib/groups";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const group = await getActiveGroup(session.user.id);
  if (!group) redirect("/onboarding");

  return <AppShell groupName={group.name}>{children}</AppShell>;
}
