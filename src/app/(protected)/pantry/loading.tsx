import { GlassCard } from "@/components/ui/glass-card";

/** Mirrors PantryView's layout: title + actions, search field, then the ingredient list. */
export default function PantryLoading() {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Loading pantry">
      <div className="flex items-center justify-between gap-2">
        <div className="bg-card h-8 w-24 animate-pulse rounded-lg" />
        <div className="flex gap-2">
          <div className="bg-card h-10 w-32 animate-pulse rounded-xl border" />
          <div className="bg-card h-10 w-20 animate-pulse rounded-xl border" />
        </div>
      </div>

      <div className="bg-card h-10 w-full animate-pulse rounded-lg border" />

      <ul className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i}>
            <GlassCard className="h-14 animate-pulse" />
          </li>
        ))}
      </ul>
    </section>
  );
}
