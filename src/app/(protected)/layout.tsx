import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppShell } from "@/components/shell/app-shell";
import { getGroupContext } from "@/lib/groups";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Before the group check: an unconfirmed address must not be able to create or join
  // a flat. Costs no query — the jwt callback already re-stamps this from its cache on
  // every request.
  if (!session.user.emailConfirmed) redirect("/verify-email");

  const group = await getGroupContext(session.user.id);
  if (!group) redirect("/onboarding");

  return <AppShell groupName={group.name}>{children}</AppShell>;
}
