"use client";

import { useActionState } from "react";

import { createGroup, type OnboardingState } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";

const initial: OnboardingState = {};

export function CreateGroupForm() {
  const [state, formAction, pending] = useActionState(createGroup, initial);

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="name" className="text-sm font-semibold">Group name</label>
        <input
          id="name" name="name" type="text" required placeholder="Flat 302"
          className="w-full rounded-lg border bg-card px-3 py-2"
        />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create group"}
      </Button>
    </form>
  );
}
