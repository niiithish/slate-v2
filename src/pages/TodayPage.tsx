import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { BookOpen, CheckCircle, CurrencyDollar, Drop, LockSimple, WarningCircle } from "@phosphor-icons/react";
import { useConfirm } from "../components/ConfirmDialog";
import { ProgressRing } from "../components/ProgressRing";
import * as api from "../lib/api";
import type { DailyLog, TodayState } from "../lib/types";

interface TodayPageProps {
  token: string;
}

export function TodayPage({ token }: TodayPageProps) {
  const [state, setState] = useState<TodayState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { confirm, dialog: confirmDialog } = useConfirm();

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const next = await api.getTodayState(token);
      setState({
        ...next,
        daily_log: next.daily_log ?? {
          trading_profit: null,
          book_title: null,
          book_description: null,
          water_ml: null,
        },
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [token]);

  async function updateStatus(habitId: string, status: "avoided" | "slipped") {
    if (!state || state.locked) return;
    try {
      const next = await api.setHabitStatus(token, habitId, state.date, status);
      setState(next);
    } catch (err) {
      setError(String(err));
    }
  }

  async function saveDailyLog(nextLog: DailyLog) {
    if (!state || state.locked) return;
    try {
      const next = await api.updateDailyLog(token, state.date, nextLog);
      setState(next);
    } catch (err) {
      setError(String(err));
    }
  }

  function patchDailyLog(patch: Partial<DailyLog>) {
    if (!state) return;
    const nextLog: DailyLog = { ...state.daily_log, ...patch };
    setState({ ...state, daily_log: nextLog });
    void saveDailyLog(nextLog);
  }

  function handleLockDay() {
    if (!state || state.locked) return;
    confirm({
      title: "Lock in today?",
      message: "You won't be able to change habit statuses for this day after locking.",
      confirmLabel: "Lock day",
      onConfirm: async () => {
        try {
          const next = await api.lockDay(token, state.date);
          setState(next);
        } catch (err) {
          setError(String(err));
        }
      },
    });
  }

  if (loading && !state) {
    return (
      <div className="space-y-4 px-5 py-6">
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
        <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />
        <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="px-5 py-6 text-sm text-danger">{error ?? "Unable to load today."}</div>
    );
  }

  const allComplete =
    state.entries.length > 0 &&
    state.entries.every((entry) => entry.status !== "pending");

  return (
    <div className="space-y-6 px-5 py-6 pb-28">
      <header>
        <p className="text-sm text-text-muted">Today</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          {new Date(state.date).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </h2>
      </header>

      <section className="glass-panel rounded-2xl p-5">
        <div className="flex items-center justify-between gap-4">
          <ProgressRing value={state.progress} label="complete" />
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-text-muted">Current streak</p>
              <p className="text-2xl font-semibold">{state.current_streak} days</p>
            </div>
            <div>
              <p className="text-text-muted">Habits tracked</p>
              <p className="text-2xl font-semibold">{state.entries.length}</p>
            </div>
          </div>
        </div>
      </section>

      {state.routines.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-secondary">Active routines</h3>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {state.routines.map((routine) => (
              <div
                key={routine.id}
                className="min-w-[180px] rounded-2xl border border-border bg-surface-2 px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: routine.color }}
                  />
                  <p className="font-medium">{routine.title}</p>
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  {routine.start_time} - {routine.end_time}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-secondary">Habits to avoid</h3>
          {state.locked ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs text-accent">
              <LockSimple size={14} weight="fill" />
              Locked
            </span>
          ) : null}
        </div>

        {state.entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">
            Add habits in Plan to start tracking today.
          </div>
        ) : (
          <div className="space-y-3">
            {state.entries.map((entry, index) => (
              <motion.div
                key={entry.habit_id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04, duration: 0.35 }}
                className="rounded-2xl border border-border bg-surface-2 p-4"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: entry.color }}
                  />
                  <p className="font-medium">{entry.title}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={state.locked}
                    onClick={() => updateStatus(entry.habit_id, "avoided")}
                    className={`focus-ring flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm transition active:scale-[0.98] ${
                      entry.status === "avoided"
                        ? "bg-success-soft text-success"
                        : "bg-surface-3 text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <CheckCircle size={18} weight="fill" />
                    Avoided
                  </button>
                  <button
                    type="button"
                    disabled={state.locked}
                    onClick={() => updateStatus(entry.habit_id, "slipped")}
                    className={`focus-ring flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm transition active:scale-[0.98] ${
                      entry.status === "slipped"
                        ? "bg-danger-soft text-danger"
                        : "bg-surface-3 text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <WarningCircle size={18} weight="fill" />
                    Slipped
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-text-secondary">Daily log</h3>
        <div className="space-y-3 rounded-2xl border border-border bg-surface-2 p-4">
          <label className="block space-y-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
              <CurrencyDollar size={14} weight="fill" />
              Trading profit
            </span>
            <input
              type="number"
              step="0.01"
              disabled={state.locked}
              value={state.daily_log.trading_profit ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                patchDailyLog({
                  trading_profit: raw === "" ? null : Number.parseFloat(raw),
                });
              }}
              placeholder="0.00"
              className="focus-ring w-full rounded-xl border border-border bg-surface-3 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted disabled:opacity-50"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
              <BookOpen size={14} weight="fill" />
              Book title
            </span>
            <input
              type="text"
              disabled={state.locked}
              value={state.daily_log.book_title ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                patchDailyLog({ book_title: value === "" ? null : value });
              }}
              placeholder="What are you reading?"
              className="focus-ring w-full rounded-xl border border-border bg-surface-3 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted disabled:opacity-50"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs text-text-muted">Reading notes</span>
            <textarea
              rows={3}
              disabled={state.locked}
              value={state.daily_log.book_description ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                patchDailyLog({ book_description: value === "" ? null : value });
              }}
              placeholder="What did you read about today?"
              className="focus-ring w-full resize-none rounded-xl border border-border bg-surface-3 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted disabled:opacity-50"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
              <Drop size={14} weight="fill" />
              Water (ml)
            </span>
            <input
              type="number"
              min={0}
              step={100}
              disabled={state.locked}
              value={state.daily_log.water_ml ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                patchDailyLog({
                  water_ml: raw === "" ? null : Number.parseInt(raw, 10),
                });
              }}
              placeholder="2500"
              className="focus-ring w-full rounded-xl border border-border bg-surface-3 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted disabled:opacity-50"
            />
          </label>
        </div>
      </section>

      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!allComplete || state.locked}
        onClick={() => handleLockDay()}
        className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-medium text-surface-0 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <LockSimple size={18} weight="fill" />
        {state.locked ? "Day locked" : "Lock in day"}
      </button>
      {confirmDialog}
    </div>
  );
}