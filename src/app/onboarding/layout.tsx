import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getActiveGroup } from "@/lib/groups";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Onboarding sits outside the (protected) group and so has its own copy of the gate.
  // This is the page the gate most needs to cover: creating or joining a flat is what
  // an unconfirmed address must not be able to do.
  if (!session.user.emailConfirmed) redirect("/verify-email");

  const group = await getActiveGroup(session.user.id);
  if (group) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
