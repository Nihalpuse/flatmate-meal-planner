import { GlassCard } from "@/components/ui/glass-card";

/** Mirrors HistoryView's layout: title, then meals grouped under a date heading. */
export default function HistoryLoading() {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Loading history">
      <div className="bg-card h-8 w-24 animate-pulse rounded-lg" />

      <div className="space-y-4">
        {[0, 1].map((day) => (
          <div key={day} className="space-y-2">
            <div className="bg-card h-4 w-20 animate-pulse rounded" />
            {[0, 1].map((meal) => (
              <GlassCard key={meal} className="h-14 animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
