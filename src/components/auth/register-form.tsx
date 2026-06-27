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
    <form action={formAction} className="space-y-4">
      <h1 className="text-2xl font-extrabold">Create account</h1>

      {googleEnabled ? (
        <div className="space-y-3">
          <GoogleButton />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}

      <div className="space-y-1">
        <label htmlFor="name" className="text-sm font-semibold">Name</label>
        <input
          id="name" name="name" type="text" required autoComplete="name"
          className="w-full rounded-lg border bg-card px-3 py-2"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-semibold">Email</label>
        <input
          id="email" name="email" type="email" required autoComplete="email"
          className="w-full rounded-lg border bg-card px-3 py-2"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-semibold">Password</label>
        <input
          id="password" name="password" type="password" required autoComplete="new-password"
          className="w-full rounded-lg border bg-card px-3 py-2"
        />
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.message ? <p className="text-sm text-primary">{state.message}</p> : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Have an account?{" "}
        <Link href="/login" className="font-semibold text-primary">Log in</Link>
      </p>
    </form>
  );
}
