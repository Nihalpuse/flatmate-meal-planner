import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          🍛 FlatMate Meal Planner
        </h1>
        <p className="text-muted-foreground mx-auto max-w-md text-balance">
          Decide what to cook in under 2 minutes. Vote, get AI suggestions, and
          never repeat the same meal twice.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/register" className={buttonVariants({ size: "lg" })}>
          Get started
        </Link>
        <Link
          href="/login"
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
