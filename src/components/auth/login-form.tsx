"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn, type AuthState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

const initial: AuthState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initial);

  return (
    <form action={formAction} className="space-y-4">
      <h1 className="text-2xl font-extrabold">Log in</h1>

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
          id="password" name="password" type="password" required autoComplete="current-password"
          className="w-full rounded-lg border bg-card px-3 py-2"
        />
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Logging in…" : "Log in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link href="/register" className="font-semibold text-primary">Create one</Link>
      </p>
    </form>
  );
}
