"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUp, type AuthState } from "@/app/(auth)/actions";
import { GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";

const initial: AuthState = {};

export function RegisterForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const [state, formAction, pending] = useActionState(signUp, initial);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Create account</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Start deciding dinners in under 2 minutes with your flatmates.
        </p>
      </div>

      {googleEnabled ? (
        <div className="space-y-2.5 pt-0.5">
          <GoogleButton />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>or sign up with email</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}

      <div className="space-y-1">
        <label htmlFor="name" className="text-xs font-semibold text-foreground">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          placeholder="Your name"
          className="w-full rounded-lg border border-border bg-card px-3.5 py-2 text-sm transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      <div className="space-y-1">
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
          className="w-full rounded-lg border border-border bg-card px-3.5 py-2 text-sm transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="text-xs font-semibold text-foreground">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="••••••••"
          className="w-full rounded-lg border border-border bg-card px-3.5 py-2 text-sm transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      {state.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {state.error}
        </div>
      ) : null}

      {state.message ? (
        <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary">
          {state.message}
        </div>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full h-9.5 font-semibold shadow-sm cursor-pointer">
        {pending ? "Creating…" : "Create account"}
      </Button>

      <p className="text-center text-xs text-muted-foreground pt-0.5">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
