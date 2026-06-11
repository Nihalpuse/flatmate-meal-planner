"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";

export default function ProtectedError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <GlassCard className="space-y-3 text-center">
      <div className="text-lg font-extrabold">Something went wrong</div>
      <p className="text-muted-foreground text-sm">
        Couldn&apos;t load this screen. Check your connection and try again.
      </p>
      <Button onClick={() => unstable_retry()}>Try again</Button>
    </GlassCard>
  );
}
