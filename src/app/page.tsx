import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { BackgroundField } from "@/components/background-field";
import { FeatureSpotlight } from "@/components/landing/feature-spotlight";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNav } from "@/components/landing/landing-nav";
import { PayoffBand } from "@/components/landing/payoff-band";
import { UseCasesBento } from "@/components/landing/use-cases-bento";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <>
      <BackgroundField />
      <LandingNav />
      <main>
        <Hero />
        <HowItWorks />
        <UseCasesBento />
        <FeatureSpotlight />
        <PayoffBand />
        <FinalCta />
      </main>
      <LandingFooter />
    </>
  );
}
