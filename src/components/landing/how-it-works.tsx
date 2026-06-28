import { CarrotIcon, SparklesIcon, UtensilsIcon } from "lucide-react";

import { Reveal } from "./reveal";

const STEPS = [
  {
    icon: CarrotIcon,
    title: "Stock your pantry",
    body: "Add what you have, or just type your grocery run in plain words.",
  },
  {
    icon: SparklesIcon,
    title: "Generate and vote",
    body: "The AI suggests meals from your ingredients. Everyone taps one.",
  },
  {
    icon: UtensilsIcon,
    title: "Cook the winner",
    body: "The top meal is locked in, with a shopping list for anything missing.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6">
      <Reveal>
        <h2 className="max-w-[18ch] text-3xl font-extrabold tracking-tight sm:text-4xl">
          Three taps from &ldquo;kuch bhi&rdquo; to dinner.
        </h2>
      </Reveal>

      <ol className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-6">
        {/* connecting hairline (desktop) */}
        <div
          aria-hidden
          className="absolute left-0 right-0 top-6 hidden h-px bg-[var(--glass-border)] md:block"
        />
        {STEPS.map((step, i) => (
          <Reveal key={step.title} delay={i * 0.1} className="relative">
            <div className="bg-background relative z-10 flex size-12 items-center justify-center rounded-full border border-[var(--glass-border)]">
              <step.icon className="text-primary size-5" strokeWidth={2} />
            </div>
            <h3 className="mt-5 text-lg font-bold">{step.title}</h3>
            <p className="text-muted-foreground mt-1.5 max-w-[34ch] text-sm leading-relaxed">
              {step.body}
            </p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
