import { GlassCard } from "@/components/ui/glass-card";

/** Mirrors SettingsView: title, then the group / invite / members / theme / danger cards. */
export default function SettingsLoading() {
  // Roughly the height each card settles at, so the page does not jump on arrival.
  const cards = ["h-20", "h-32", "h-28", "h-24", "h-24"];

  return (
    <section className="space-y-4" aria-busy="true" aria-label="Loading settings">
      <div className="bg-card h-8 w-28 animate-pulse rounded-lg" />

      {cards.map((height, i) => (
        <GlassCard key={i} className={`${height} animate-pulse`} />
      ))}

      <div className="pt-2">
        <div className="bg-card h-10 w-32 animate-pulse rounded-xl border" />
      </div>
    </section>
  );
}
