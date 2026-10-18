import Link from "next/link";
import { redirect } from "next/navigation";
import { Utensils } from "lucide-react";

import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";
import { RecipeShowcase } from "@/components/auth/recipe-showcase";
import { ThemeToggle } from "@/components/theme-toggle";
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
    <div className="grid h-screen max-h-screen w-full lg:grid-cols-2 overflow-hidden">
      {/* Left Panel: Form */}
      <div className="flex flex-col justify-between p-5 sm:p-6 lg:p-8 xl:p-10 h-full overflow-y-auto lg:overflow-hidden">
        {/* Mobile-only header (hidden on desktop where it lives on the right side) */}
        <div className="flex items-center justify-between lg:hidden mb-2">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold tracking-tight text-foreground transition-opacity hover:opacity-85"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-base border border-primary/20 shadow-xs">
              🍛
            </span>
            <span className="text-sm font-extrabold tracking-tight">Aaj Kya Banega?</span>
          </Link>

          <ThemeToggle />
        </div>

        {/* Center: Main Auth Form Container */}
        <div className="my-auto mx-auto w-full max-w-sm py-2 sm:py-3">
          {error ? (
            <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              {signInErrorMessage(error)}
            </div>
          ) : null}
          <LoginForm googleEnabled={googleEnabled} />
        </div>

        {/* Bottom Footer Note */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2.5 pb-2 border-t border-border/40">
          <span>&copy; {new Date().getFullYear()} Aaj Kya Banega?</span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
            <Utensils className="size-3 text-primary" /> Stress-free shared dinners
          </span>
        </div>
      </div>

      {/* Right Panel: Header + Recipe Showcase Slideshow */}
      <div className="hidden lg:flex flex-col justify-between items-center relative overflow-hidden bg-muted/30 border-l border-border/60 p-5 xl:p-8 h-full">
        {/* Ambient subtle light glows */}
        <div className="pointer-events-none absolute -top-40 -right-40 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-40 size-96 rounded-full bg-primary/10 blur-3xl" />

        {/* Top Header on Right Side */}
        <div className="w-full flex items-center justify-between z-10">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold tracking-tight text-foreground transition-opacity hover:opacity-85"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-base border border-primary/20 shadow-xs">
              🍛
            </span>
            <span className="text-sm font-extrabold tracking-tight">Aaj Kya Banega?</span>
          </Link>

          <ThemeToggle />
        </div>

        {/* Center: Recipe Showcase */}
        <div className="my-auto w-full z-10 flex items-center justify-center">
          <RecipeShowcase />
        </div>

        {/* Bottom balance spacer */}
        <div className="w-full h-8 invisible" />
      </div>
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
