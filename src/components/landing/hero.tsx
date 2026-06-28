import Image from "next/image";
import Link from "next/link";

import { Kicker } from "@/components/ui/kicker";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { MagneticCta } from "./magnetic-cta";
import { Reveal } from "./reveal";
import { VotePreview } from "./vote-preview";

export function Hero() {
  return (
    <section className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-[1400px] items-center gap-12 px-4 pt-16 pb-20 sm:px-6 md:grid-cols-2 md:pt-24">
      <Reveal className="space-y-6">
        <Kicker>For homes, PGs and hostels</Kicker>
        <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
          Settle tonight&apos;s dinner in two minutes.
        </h1>
        <p className="text-muted-foreground max-w-[48ch] text-lg leading-relaxed">
          Your home votes, the AI suggests meals from what is already in the kitchen, and the winner gets cooked. No more daily debate.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <MagneticCta href="/register">Get started</MagneticCta>
          <Link
            href="#use-cases"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5")}
          >
            See how it works
          </Link>
        </div>
      </Reveal>

      <Reveal delay={0.12} className="relative flex justify-center md:justify-end">
        {/* Real food photography via loremflickr (keyworded, stable lock). Swap for brand photos when available. */}
        <Image
          src="https://loremflickr.com/640/800/indian,thali,dinner/all?lock=11"
          alt=""
          aria-hidden
          width={640}
          height={800}
          priority
          unoptimized
          className="absolute -right-2 -top-6 hidden h-[88%] w-[58%] rounded-[28px] object-cover shadow-[0_24px_60px_var(--glass-shadow)] md:block"
        />
        <div className="relative z-10 w-full max-w-sm md:translate-x-[-8%] md:translate-y-4">
          <VotePreview />
        </div>
      </Reveal>
    </section>
  );
}
