import { redirect } from "next/navigation";

import { auth } from "@/auth";

import { VerifyEmailView } from "./verify-email-view";

/** Where the layouts park a signed-in user whose address is not confirmed yet. */
export default async function VerifyEmailPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.emailConfirmed) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <VerifyEmailView email={session.user.email ?? "your inbox"} />
    </main>
  );
}
