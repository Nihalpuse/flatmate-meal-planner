import { GlassCard } from "@/components/ui/glass-card";
import { Kicker } from "@/components/ui/kicker";
import { groupHistoryByDate, type HistoryEntry } from "@/lib/history";

export function HistoryView({ entries }: { entries: HistoryEntry[] }) {
  const days = groupHistoryByDate(entries);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-extrabold">History</h1>

      {days.length === 0 ? (
        <GlassCard className="text-muted-foreground text-sm">
          No meals yet. Finalized meals will show up here.
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {days.map((day) => (
            <div key={day.date} className="space-y-2">
              <div className="text-muted-foreground text-xs font-bold">{day.date}</div>
              {day.meals.map((meal, i) => (
                <GlassCard key={i} className="flex items-center justify-between">
                  <span className="font-bold">{meal.mealName}</span>
                  <Kicker variant="solid">{meal.mealType}</Kicker>
                </GlassCard>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
