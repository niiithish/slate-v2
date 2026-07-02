import { useEffect, useState } from "react";
import { Fire, TrendUp } from "@phosphor-icons/react";
import { Heatmap } from "../components/Heatmap";
import * as api from "../lib/api";
import type { StatsState } from "../lib/types";

interface StatsPageProps {
  token: string;
}

export function StatsPage({ token }: StatsPageProps) {
  const [stats, setStats] = useState<StatsState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getStats(token, 12)
      .then(setStats)
      .catch((err) => setError(String(err)));
  }, [token]);

  if (error) {
    return <div className="px-5 py-6 text-sm text-danger">{error}</div>;
  }

  if (!stats) {
    return (
      <div className="space-y-4 px-5 py-6">
        <div className="h-28 animate-pulse rounded-2xl bg-surface-2" />
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-5 py-6 pb-28">
      <header>
        <p className="text-sm text-text-muted">Stats</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">Your momentum</h2>
      </header>

      <section className="grid grid-cols-3 gap-3">
        {[
          { label: "Avoided", value: stats.total_avoided, icon: TrendUp },
          { label: "Slipped", value: stats.total_slipped, icon: Fire },
          { label: "Locked days", value: stats.days_locked, icon: Fire },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="glass-panel rounded-2xl p-4">
            <Icon size={18} className="text-accent" />
            <p className="mt-3 text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-text-muted">{label}</p>
          </div>
        ))}
      </section>

      <section className="glass-panel rounded-2xl p-5">
        <Heatmap cells={stats.heatmap} />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-text-secondary">Streaks by habit</h3>
        {stats.streaks.length === 0 ? (
          <p className="text-sm text-text-muted">No streak data yet.</p>
        ) : (
          <div className="space-y-2">
            {stats.streaks.map((streak) => (
              <div
                key={streak.habit_id}
                className="flex items-center justify-between rounded-2xl border border-border bg-surface-2 px-4 py-3"
              >
                <div>
                  <p className="font-medium">{streak.title}</p>
                  <p className="text-xs text-text-muted">
                    Best {streak.best_streak} days
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-semibold text-accent">
                    {streak.current_streak}
                  </p>
                  <p className="text-xs text-text-muted">current</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}