import Link from "next/link";

import { GlassCard } from "@/components/ui/glass-card";
import { consumeVerificationToken } from "@/lib/email-verification";

/**
 * Lands the emailed confirmation link.
 *
 * Deliberately public: the link is often opened on a different device from the one
 * that signed up, where there is no session to speak of. The token is the credential
 * — it is single-use, hashed at rest, and expires in 24 hours.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token
    ? await consumeVerificationToken(token)
    : ({ ok: false, reason: "invalid" } as const);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <GlassCard className="w-full max-w-sm space-y-3 text-center">
        {result.ok ? (
          <>
            <h1 className="text-xl font-extrabold">Email confirmed</h1>
            <p className="text-muted-foreground text-sm">
              {result.email} is verified. You can start planning meals now.
            </p>
            <Link
              href="/dashboard"
              className="text-primary block text-sm font-semibold underline underline-offset-2"
            >
              Continue
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-extrabold">
              {result.reason === "expired" ? "Link expired" : "Link not valid"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {result.reason === "expired"
                ? "Confirmation links last 24 hours. Sign in and we'll send a fresh one."
                : "This link has already been used, or it isn't one of ours. Sign in and we'll send a fresh one."}
            </p>
            <Link
              href="/login"
              className="text-primary block text-sm font-semibold underline underline-offset-2"
            >
              Go to sign in
            </Link>
          </>
        )}
      </GlassCard>
    </main>
  );
}
