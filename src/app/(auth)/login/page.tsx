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
        <p className="text-destructive text-sm">{signInErrorMessage(error)}</p>
      ) : null}
      <LoginForm googleEnabled={googleEnabled} />
    </div>
  );
}

/**
 * Auth.js reports OAuthAccountNotLinked when the Google account's email already
 * belongs to a password account. We deliberately do not auto-link those (see
 * auth.ts), so say what happened instead of a generic failure — otherwise the user
 * just sees Google "fail" with no way forward.
 */
function signInErrorMessage(error: string): string {
  if (error === "OAuthAccountNotLinked") {
    return "This email already has an account with a password. Sign in with your password below.";
  }
  return "Google sign-in failed. Please try again.";
}
