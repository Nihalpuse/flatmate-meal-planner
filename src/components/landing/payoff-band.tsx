import { Reveal } from "./reveal";

export function PayoffBand() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-24 sm:px-6">
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="text-2xl font-bold leading-snug tracking-tight sm:text-4xl sm:leading-snug">
          <span className="text-muted-foreground">
            Fifteen to twenty minutes of &ldquo;tu bata, kuch bhi&rdquo; every
            single night.
          </span>{" "}
          <span className="text-foreground">Or two minutes, settled together.</span>
        </p>
      </Reveal>
    </section>
  );
}
