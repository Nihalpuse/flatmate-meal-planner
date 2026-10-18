import Link from "next/link";
import { ArrowLeft, Home } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-background text-foreground relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -top-40 -right-40 size-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 size-96 rounded-full bg-primary/10 blur-3xl" />

      {/* Top Navigation */}
      <header className="border-b border-border/40 bg-background/60 backdrop-blur-md px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-bold tracking-tight text-foreground transition-opacity hover:opacity-85"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-lg border border-primary/20 shadow-xs">
              🍛
            </span>
            <span className="text-base font-extrabold tracking-tight">Aaj Kya Banega?</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Main 404 Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto my-auto">
        {/* Visual Badge */}
        <div className="relative mb-6">
          <div className="flex size-24 sm:size-28 items-center justify-center rounded-3xl bg-primary/10 border border-primary/20 shadow-lg text-4xl sm:text-5xl">
            🍲
          </div>
          <span className="absolute -top-2 -right-2 rounded-full bg-destructive/90 text-white text-xs font-black px-2 py-0.5 shadow-xs">
            404
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          Dish not found in the kitchen
        </h1>

        <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-md">
          The recipe or page you’re looking for seems to have been eaten, moved, or never existed in the flat pantry.
        </p>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 w-full">
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ size: "default" }), "h-10 px-5 gap-2 font-semibold shadow-sm")}
          >
            <Home className="size-4" />
            <span>Go to Dashboard</span>
          </Link>

          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline", size: "default" }), "h-10 px-5 gap-2 font-medium")}
          >
            <ArrowLeft className="size-4" />
            <span>Back to Home</span>
          </Link>
        </div>

        {/* Quick Links Card */}
        <div className="mt-10 w-full rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-4 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Popular destinations:</span>
          <div className="mt-2.5 flex flex-wrap justify-center gap-4 text-primary font-medium">
            <Link href="/dashboard" className="hover:underline flex items-center gap-1">
              <span>🍛 Meal Votes</span>
            </Link>
            <span className="text-border">•</span>
            <Link href="/pantry" className="hover:underline flex items-center gap-1">
              <span>🥕 Pantry Tracker</span>
            </Link>
            <span className="text-border">•</span>
            <Link href="/login" className="hover:underline flex items-center gap-1">
              <span>🔐 Sign In</span>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-4 px-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Aaj Kya Banega? • Stress-free shared dinners
      </footer>
    </div>
  );
}
