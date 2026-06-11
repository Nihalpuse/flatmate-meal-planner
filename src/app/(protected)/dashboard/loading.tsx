import { GlassCard } from "@/components/ui/glass-card";

export default function DashboardLoading() {
  return (
    <section className="space-y-4" aria-busy="true">
      <div className="bg-card h-8 w-28 animate-pulse rounded-lg" />
      <div className="flex gap-2">
        <div className="bg-card h-10 flex-1 animate-pulse rounded-xl border" />
        <div className="bg-card h-10 flex-1 animate-pulse rounded-xl border" />
      </div>
      {[0, 1, 2].map((i) => (
        <GlassCard key={i} className="h-16 animate-pulse" />
      ))}
    </section>
  );
}
