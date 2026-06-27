import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";
import { env } from "@/env";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { error } = await searchParams;
  const googleEnabled = Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-destructive text-sm">Google sign-in failed. Please try again.</p>
      ) : null}
      <LoginForm googleEnabled={googleEnabled} />
    </div>
  );
}
