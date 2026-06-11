"use client";

import { useActionState } from "react";

import { joinGroup, type OnboardingState } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";

const initial: OnboardingState = {};

export function JoinGroupForm({ defaultCode }: { defaultCode?: string }) {
  const [state, formAction, pending] = useActionState(joinGroup, initial);

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="code" className="text-sm font-semibold">Invite code</label>
        <input
          id="code" name="code" type="text" required placeholder="ABC123"
          defaultValue={defaultCode}
          className="w-full rounded-lg border bg-card px-3 py-2 uppercase"
        />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={pending} variant="outline" className="w-full">
        {pending ? "Joining…" : "Join group"}
      </Button>
    </form>
  );
}
