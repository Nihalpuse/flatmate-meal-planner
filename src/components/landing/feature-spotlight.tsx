import Image from "next/image";

import { Reveal } from "./reveal";

export function FeatureSpotlight() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <Reveal className="order-2 md:order-1 space-y-5">
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            It cooks with what you already have.
          </h2>
          <p className="text-muted-foreground max-w-[46ch] text-lg leading-relaxed">
            No recipe rabbit holes. Suggestions are built from your pantry first,
            so most nights you cook without a single trip to the store.
          </p>
          <ul className="space-y-3">
            {[
              "Uses available ingredients before anything else",
              "Flags the few items you would need to buy",
              "Skips meals you have eaten recently",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="bg-primary mt-2 size-1.5 shrink-0 rounded-full" />
                <span className="text-foreground/90">{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.1} className="order-1 md:order-2">
          <div className="overflow-hidden rounded-[28px] border border-[var(--glass-border)] shadow-[0_24px_60px_var(--glass-shadow)]">
            {/* Swap for brand photos when available. */}
            <Image
              src="/images/fresh-ingredients.jpg"
              alt="Fresh vegetables and greens arranged in a bowl"
              width={800}
              height={600}
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
