"use client";

import { useTransition } from "react";

import { signInWithGoogle } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export function GoogleButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={pending}
      onClick={() => start(() => signInWithGoogle())}
    >
      {pending ? "Redirecting…" : "Continue with Google"}
    </Button>
  );
}
