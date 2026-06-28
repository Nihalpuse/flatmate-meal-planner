import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--glass-border)]">
      <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row sm:px-6">
        <span className="font-mono text-sm font-extrabold tracking-tight">
          Aaj Kya Banega?
        </span>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            Log in
          </Link>
          <Link href="/register" className="text-muted-foreground hover:text-foreground">
            Create account
          </Link>
        </nav>
        <span className="text-muted-foreground text-xs">
          Made for homes tired of deciding what to cook.
        </span>
      </div>
    </footer>
  );
}
