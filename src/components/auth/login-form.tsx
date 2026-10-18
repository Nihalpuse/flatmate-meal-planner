"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn, type AuthState } from "@/app/(auth)/actions";
import { GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";

const initial: AuthState = {};

export function LoginForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const [state, formAction, pending] = useActionState(signIn, initial);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Log in</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Welcome back! Sign in to coordinate tonight&apos;s dinner.
        </p>
      </div>

      {googleEnabled ? (
        <div className="space-y-3 pt-1">
          <GoogleButton />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>or continue with email</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-xs font-semibold text-foreground">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="name@flat.com"
          className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-xs font-semibold text-foreground">
            Password
          </label>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      {state.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {state.error}
        </div>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full h-10 font-semibold shadow-sm cursor-pointer">
        {pending ? "Logging in…" : "Log in"}
      </Button>

      <p className="text-center text-xs text-muted-foreground pt-1">
        No account yet?{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          Create one
        </Link>
      </p>
    </form>
  );
}

