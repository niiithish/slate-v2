import { Fire, TrendUp } from "@phosphor-icons/react";
import { Heatmap } from "../components/Heatmap";
import { useStats } from "../lib/queries";

interface StatsPageProps {
  token: string;
}

export function StatsPage({ token }: StatsPageProps) {
  const { data: stats, error, isLoading } = useStats(token);

  if (error) {
    return <div className="px-5 py-6 text-danger text-sm">{String(error)}</div>;
  }

  if (isLoading || !stats) {
    return (
      <div className="space-y-4 px-5 py-6">
        <div className="h-28 animate-pulse rounded-2xl bg-surface-2" />
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-5 pt-3 pb-28">
      <header>
        <p className="text-sm text-text-muted">Stats</p>
        <h2 className="mt-1 font-semibold text-2xl tracking-tight">
          Your momentum
        </h2>
      </header>

      <section className="grid grid-cols-3 gap-3">
        {[
          { label: "Avoided", value: stats.total_avoided, icon: TrendUp },
          { label: "Slipped", value: stats.total_slipped, icon: Fire },
          { label: "Locked days", value: stats.days_locked, icon: Fire },
        ].map(({ label, value, icon: Icon }) => (
          <div className="glass-panel rounded-2xl p-4" key={label}>
            <Icon className="text-accent" size={18} />
            <p className="mt-3 font-semibold text-2xl">{value}</p>
            <p className="mt-1 text-text-muted text-xs">{label}</p>
          </div>
        ))}
      </section>

      <section className="glass-panel rounded-2xl p-5">
        <Heatmap cells={stats.heatmap} />
      </section>

      <section className="space-y-3">
        <h3 className="font-medium text-sm text-text-secondary">
          Streaks by habit
        </h3>
        {stats.streaks.length === 0 ? (
          <p className="text-sm text-text-muted">No streak data yet.</p>
        ) : (
          <div className="space-y-2">
            {stats.streaks.map((streak) => (
              <div
                className="flex items-center justify-between rounded-2xl border border-border bg-surface-2 px-4 py-3"
                key={streak.habit_id}
              >
                <div>
                  <p className="font-medium">{streak.title}</p>
                  <p className="text-text-muted text-xs">
                    Best {streak.best_streak} days
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-accent text-xl">
                    {streak.current_streak}
                  </p>
                  <p className="text-text-muted text-xs">current</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
