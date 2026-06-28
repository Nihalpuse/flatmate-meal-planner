import { Kicker } from "@/components/ui/kicker";

import { MagneticCta } from "./magnetic-cta";
import { Reveal } from "./reveal";

export function FinalCta() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 pb-24 sm:px-6">
      <Reveal className="bg-primary/10 relative overflow-hidden rounded-[32px] border border-[var(--glass-border)] px-6 py-16 text-center sm:px-12 sm:py-20">
        <Kicker>Free to start</Kicker>
        <h2 className="mx-auto mt-4 max-w-[20ch] text-3xl font-extrabold tracking-tight sm:text-5xl">
          Get everyone fed without the fuss.
        </h2>
        <p className="text-muted-foreground mx-auto mt-4 max-w-[42ch] text-lg">
          Create a group, share the code, and decide tonight&apos;s dinner before
          the cook even arrives.
        </p>
        <div className="mt-8 flex justify-center">
          <MagneticCta href="/register">Get started</MagneticCta>
        </div>
      </Reveal>
    </section>
  );
}
