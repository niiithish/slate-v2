import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BookOpen,
  CaretRight,
  CheckCircle,
  CurrencyDollar,
  Drop,
  LockSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { DayNavigator } from "../components/DayNavigator";
import { FormSheet, sheetInputClass } from "../components/FormSheet";
import { ProgressRing } from "../components/ProgressRing";
import * as api from "../lib/api";
import { isFuture, todayString } from "../lib/dates";
import type { DailyLog, TodayState } from "../lib/types";

interface TodayPageProps {
  token: string;
}

type LogSheet = "trading" | "reading" | "water" | null;

const EMPTY_DAILY_LOG: DailyLog = {
  trading_profit: null,
  book_title: null,
  book_description: null,
  water_ml: null,
};

function formatTrading(value: number | null): string {
  if (value === null) return "Tap to log";
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}$${value.toFixed(2)}`;
}

function formatReading(log: DailyLog): string {
  if (log.book_title) return log.book_title;
  if (log.book_description) return "Notes added";
  return "Tap to log";
}

function formatWater(value: number | null): string {
  if (value === null) return "Tap to log";
  return `${value.toLocaleString()} ml`;
}

export function TodayPage({ token }: TodayPageProps) {
  const [selectedDate, setSelectedDate] = useState(todayString);
  const [state, setState] = useState<TodayState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSheet, setActiveSheet] = useState<LogSheet>(null);
  const [draft, setDraft] = useState<DailyLog>(EMPTY_DAILY_LOG);
  const [savingLog, setSavingLog] = useState(false);

  const loadDay = useCallback(
    async (date: string, showSkeleton = false) => {
      if (showSkeleton) setLoading(true);
      setError(null);
      try {
        const next = await api.getTodayState(token, date);
        setState({
          ...next,
          daily_log: next.daily_log ?? EMPTY_DAILY_LOG,
        });
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    setSelectedDate(todayString());
    setState(null);
  }, [token]);

  useEffect(() => {
    void loadDay(selectedDate, state === null);
  }, [selectedDate, loadDay, state === null]);

  function handleDateChange(date: string) {
    setLoading(true);
    setSelectedDate(date);
  }

  async function updateStatus(habitId: string, status: "avoided" | "slipped") {
    if (!state || state.locked || isFuture(selectedDate)) return;
    try {
      const next = await api.setHabitStatus(token, habitId, state.date, status);
      setState({ ...next, daily_log: next.daily_log ?? EMPTY_DAILY_LOG });
    } catch (err) {
      setError(String(err));
    }
  }

  function openSheet(sheet: LogSheet) {
    if (!state || isFuture(selectedDate) || state.locked) return;
    setDraft({ ...state.daily_log });
    setActiveSheet(sheet);
  }

  function closeSheet() {
    if (savingLog) return;
    setActiveSheet(null);
  }

  async function saveSheet() {
    if (!state || savingLog) return;
    setSavingLog(true);
    setError(null);
    try {
      const next = await api.updateDailyLog(token, state.date, draft);
      setState({ ...next, daily_log: next.daily_log ?? EMPTY_DAILY_LOG });
      setActiveSheet(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingLog(false);
    }
  }

  const viewingFuture = isFuture(selectedDate);
  const readOnly = viewingFuture || Boolean(state?.locked);

  if (loading && !state) {
    return (
      <div className="space-y-4 px-5 py-6">
        <div className="h-20 animate-pulse rounded-2xl bg-surface-2" />
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
        <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="px-5 py-6 text-sm text-danger">{error ?? "Unable to load today."}</div>
    );
  }

  const logRows = [
    {
      key: "trading" as const,
      icon: CurrencyDollar,
      label: "Trading",
      summary: formatTrading(state.daily_log.trading_profit),
      filled: state.daily_log.trading_profit !== null,
    },
    {
      key: "reading" as const,
      icon: BookOpen,
      label: "Reading",
      summary: formatReading(state.daily_log),
      filled: Boolean(state.daily_log.book_title || state.daily_log.book_description),
    },
    {
      key: "water" as const,
      icon: Drop,
      label: "Water",
      summary: formatWater(state.daily_log.water_ml),
      filled: state.daily_log.water_ml !== null,
    },
  ];

  return (
    <div className="space-y-6 px-5 py-6 pb-28">
      <header>
        <DayNavigator
          date={selectedDate}
          onChange={handleDateChange}
          disabled={loading}
        />
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={selectedDate}
          initial={{ opacity: 0, x: loading ? 0 : 12 }}
          animate={{ opacity: loading ? 0.55 : 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-6"
        >
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
              <h3 className="text-sm font-medium text-text-secondary">
                {viewingFuture ? "Scheduled routines" : "Active routines"}
              </h3>
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface-2">
                {[...state.routines]
                  .sort((a, b) => a.start_time.localeCompare(b.start_time))
                  .map((routine) => (
                    <li
                      key={routine.id}
                      className="flex items-center gap-3 px-3 py-2.5"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: routine.color }}
                      />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">
                        {routine.title}
                      </p>
                      <p className="shrink-0 font-mono text-xs text-text-muted">
                        {routine.start_time}–{routine.end_time}
                      </p>
                    </li>
                  ))}
              </ul>
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
              ) : viewingFuture ? (
                <span className="rounded-full bg-surface-3 px-2.5 py-1 text-xs text-text-muted">
                  Preview
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
                        disabled={readOnly}
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
                        disabled={readOnly}
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
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface-2">
              {logRows.map((row) => {
                const Icon = row.icon;
                return (
                  <li key={row.key}>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => openSheet(row.key)}
                      className="focus-ring flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-surface-3 active:scale-[0.99] disabled:cursor-default disabled:opacity-60"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-accent">
                        <Icon size={16} weight="fill" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{row.label}</span>
                        <span
                          className={`mt-0.5 block truncate text-xs ${
                            row.filled ? "text-text-secondary" : "text-text-muted"
                          }`}
                        >
                          {row.summary}
                        </span>
                      </span>
                      {!readOnly ? (
                        <CaretRight size={14} className="shrink-0 text-text-muted" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {error ? (
            <p className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <FormSheet
        open={activeSheet === "trading"}
        title="Trading profit"
        onClose={closeSheet}
        onSave={saveSheet}
        saving={savingLog}
      >
        <label className="block space-y-1.5">
          <span className="text-xs text-text-muted">Amount for this day (use negative for loss)</span>
          <input
            type="number"
            step="0.01"
            autoFocus
            value={draft.trading_profit ?? ""}
            onChange={(event) => {
              const raw = event.target.value;
              setDraft((current) => ({
                ...current,
                trading_profit: raw === "" ? null : Number.parseFloat(raw),
              }));
            }}
            placeholder="0.00"
            className={sheetInputClass}
          />
        </label>
      </FormSheet>

      <FormSheet
        open={activeSheet === "reading"}
        title="Reading"
        onClose={closeSheet}
        onSave={saveSheet}
        saving={savingLog}
      >
        <label className="block space-y-1.5">
          <span className="text-xs text-text-muted">Book title</span>
          <input
            type="text"
            autoFocus
            value={draft.book_title ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((current) => ({
                ...current,
                book_title: value === "" ? null : value,
              }));
            }}
            placeholder="What are you reading?"
            className={sheetInputClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-text-muted">What did you read about?</span>
          <textarea
            rows={4}
            value={draft.book_description ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((current) => ({
                ...current,
                book_description: value === "" ? null : value,
              }));
            }}
            placeholder="A few lines on today's reading..."
            className={`${sheetInputClass} resize-none`}
          />
        </label>
      </FormSheet>

      <FormSheet
        open={activeSheet === "water"}
        title="Water intake"
        onClose={closeSheet}
        onSave={saveSheet}
        saving={savingLog}
      >
        <label className="block space-y-1.5">
          <span className="text-xs text-text-muted">Milliliters for this day</span>
          <input
            type="number"
            min={0}
            step={100}
            autoFocus
            value={draft.water_ml ?? ""}
            onChange={(event) => {
              const raw = event.target.value;
              setDraft((current) => ({
                ...current,
                water_ml: raw === "" ? null : Number.parseInt(raw, 10),
              }));
            }}
            placeholder="2500"
            className={sheetInputClass}
          />
        </label>
      </FormSheet>
    </div>
  );
}