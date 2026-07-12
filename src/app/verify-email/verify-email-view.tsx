"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";

import { resendVerification } from "./actions";

export function VerifyEmailView({ email }: { email: string }) {
  const [pending, start] = useTransition();

  return (
    <GlassCard className="w-full max-w-sm space-y-3 text-center">
      <h1 className="text-xl font-extrabold">Confirm your email</h1>
      <p className="text-muted-foreground text-sm">
        We sent a link to <span className="font-semibold">{email}</span>. Open it to
        start planning meals with your flat.
      </p>

      <Button
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await resendVerification();
            if (res?.error) toast.error(res.error);
            else if (res?.sent) toast.success("Sent — check your inbox.");
          })
        }
      >
        {pending ? "Sending…" : "Resend the email"}
      </Button>

      <p className="text-muted-foreground text-xs">
        Already confirmed it? Reload this page.
      </p>

      <div className="pt-1">
        <LogoutButton />
      </div>
    </GlassCard>
  );
}
