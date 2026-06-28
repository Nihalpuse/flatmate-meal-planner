import {
  CalendarClock,
  MoonStar,
  Send,
  Sparkles,
  Sun,
  Users,
} from "lucide-react";

import { CountChip } from "@/components/ui/count-chip";
import { Kicker } from "@/components/ui/kicker";

import { Reveal } from "./reveal";

const SUGGESTIONS = ["Egg Fried Rice", "Aloo Jeera + Roti", "Masala Rice Bowl"];
const HISTORY = [
  { date: "Jun 09", meal: "Rajma Chawal" },
  { date: "Jun 08", meal: "Veg Pulao" },
  { date: "Jun 07", meal: "Egg Curry" },
];

export function UseCasesBento() {
  return (
    <section id="use-cases" className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6">
      <Reveal className="max-w-2xl">
        <Kicker>What it actually does</Kicker>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Everything a home argues about, handled.
        </h2>
      </Reveal>

      <Reveal
        delay={0.1}
        className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:[grid-auto-rows:minmax(0,1fr)]"
      >
        {/* A — AI suggestions (large) */}
        <article className="bg-card supports-[backdrop-filter]:bg-[var(--glass-bg)] supports-[backdrop-filter]:backdrop-blur-md flex flex-col gap-4 rounded-[22px] border border-[var(--glass-border)] p-6 shadow-[inset_0_1px_0_var(--glass-highlight)] md:col-span-2 md:row-span-2">
          <div className="flex items-center gap-2">
            <Sparkles className="text-primary size-5" strokeWidth={2} />
            <Kicker>AI from your pantry</Kicker>
          </div>
          <h3 className="text-2xl font-bold tracking-tight">
            Five dinners you can cook tonight, from what you already have.
          </h3>
          <p className="text-muted-foreground max-w-[44ch] text-sm leading-relaxed">
            Gemini reads your ingredients and your recent meals, then proposes
            budget-friendly dishes that skip whatever you cooked last.
          </p>
          <ul className="mt-auto space-y-2">
            {SUGGESTIONS.map((s, i) => (
              <li
                key={s}
                className="bg-secondary/70 flex items-center justify-between rounded-[14px] px-4 py-3"
              >
                <span className="font-semibold">{s}</span>
                <CountChip count={[3, 2, 1][i]} />
              </li>
            ))}
          </ul>
        </article>

        {/* B — group voting */}
        <article className="bg-secondary/60 flex flex-col gap-3 rounded-[22px] border border-[var(--glass-border)] p-6">
          <Users className="text-primary size-5" strokeWidth={2} />
          <h3 className="text-lg font-bold">One tap, one vote</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Everyone at home gets a single vote, changeable until the cook
            arrives.
          </p>
        </article>

        {/* C — grocery list */}
        <article className="bg-muted/70 flex flex-col gap-3 rounded-[22px] border border-[var(--glass-border)] p-6">
          <h3 className="text-lg font-bold">Know what to buy</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Missing items become a tidy list.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <span className="bg-destructive/10 text-destructive rounded-full px-2.5 py-1 text-xs font-semibold">
              paneer
            </span>
            <span className="bg-destructive/10 text-destructive rounded-full px-2.5 py-1 text-xs font-semibold">
              cream
            </span>
          </div>
          <span className="text-primary mt-auto inline-flex items-center gap-1.5 text-sm font-semibold">
            <Send className="size-4" strokeWidth={2} />
            Share on WhatsApp
          </span>
        </article>

        {/* D — history (wide) */}
        <article className="bg-secondary/60 flex flex-col gap-4 rounded-[22px] border border-[var(--glass-border)] p-6 md:col-span-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="text-primary size-5" strokeWidth={2} />
            <h3 className="text-lg font-bold">Never cook the same thing twice</h3>
          </div>
          <ul className="grid gap-2 sm:grid-cols-3">
            {HISTORY.map((h) => (
              <li
                key={h.date}
                className="bg-background/50 rounded-[14px] border border-[var(--glass-border)] px-4 py-3"
              >
                <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {h.date}
                </div>
                <div className="mt-1 font-semibold">{h.meal}</div>
              </li>
            ))}
          </ul>
        </article>

        {/* E — lunch + dinner */}
        <article className="flex flex-col gap-3 rounded-[22px] border border-[var(--glass-border)] bg-card p-6 supports-[backdrop-filter]:bg-[var(--glass-bg)]">
          <h3 className="text-lg font-bold">Lunch and dinner, apart</h3>
          <div className="flex gap-2">
            <span className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold">
              <Sun className="size-3.5" strokeWidth={2.5} /> Lunch
            </span>
            <span className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold">
              <MoonStar className="size-3.5" strokeWidth={2.5} /> Dinner
            </span>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Two sessions a day, each voted and finalized on its own.
          </p>
        </article>
      </Reveal>
    </section>
  );
}
