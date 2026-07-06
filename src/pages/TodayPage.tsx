import {
  BookOpen,
  CaretRight,
  CheckCircle,
  CurrencyDollar,
  Drop,
  LockSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { DayNavigator } from "../components/DayNavigator";
import { FormSheet, sheetInputClass } from "../components/FormSheet";
import { ProgressRing } from "../components/ProgressRing";
import * as api from "../lib/api";
import { isFuture, todayString } from "../lib/dates";
import { normalizeTodayState, useTodayState } from "../lib/queries";
import { invalidateAfterTodayChange, queryKeys } from "../lib/queryClient";
import { syncReminders } from "../lib/reminders";
import type { DailyLog } from "../lib/types";

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
  if (value === null) {
    return "Tap to log";
  }
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}$${value.toFixed(2)}`;
}

function formatReading(log: DailyLog): string {
  if (log.book_title) {
    return log.book_title;
  }
  if (log.book_description) {
    return "Notes added";
  }
  return "Tap to log";
}

function formatWater(value: number | null): string {
  if (value === null) {
    return "Tap to log";
  }
  return `${value.toLocaleString()} ml`;
}

function formatQueryError(err: unknown): string {
  const message = String(err);
  if (
    message.includes("connection abort") ||
    message.includes("connection error") ||
    message.includes("os error 103")
  ) {
    return "Connection lost. Pull to refresh or try again in a moment.";
  }
  return message;
}

export function TodayPage({ token }: TodayPageProps) {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(todayString);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<LogSheet>(null);
  const [draft, setDraft] = useState<DailyLog>(EMPTY_DAILY_LOG);
  const [savingLog, setSavingLog] = useState(false);

  const {
    data: state,
    error: queryError,
    isFetching,
    isLoading,
  } = useTodayState(token, selectedDate);

  function handleDateChange(date: string) {
    setSelectedDate(date);
  }

  function updateTodayCache(
    next: Awaited<ReturnType<typeof api.getTodayState>>
  ) {
    queryClient.setQueryData(
      queryKeys.today(token, selectedDate),
      normalizeTodayState(next)
    );
  }

  async function updateStatus(habitId: string, status: "avoided" | "slipped") {
    if (!state || state.locked || isFuture(selectedDate)) {
      return;
    }
    setActionError(null);
    try {
      const next = await api.setHabitStatus(token, habitId, state.date, status);
      updateTodayCache(next);
      await invalidateAfterTodayChange(token, selectedDate);
      await syncReminders(token);
    } catch (err) {
      setActionError(formatQueryError(err));
    }
  }

  function openSheet(sheet: LogSheet) {
    if (!state || isFuture(selectedDate) || state.locked) {
      return;
    }
    setDraft({ ...state.daily_log });
    setActiveSheet(sheet);
  }

  function closeSheet() {
    if (savingLog) {
      return;
    }
    setActiveSheet(null);
  }

  async function saveSheet() {
    if (!state || savingLog) {
      return;
    }
    setSavingLog(true);
    setActionError(null);
    try {
      const next = await api.updateDailyLog(token, state.date, draft);
      updateTodayCache(next);
      setActiveSheet(null);
      await invalidateAfterTodayChange(token, selectedDate);
      await syncReminders(token);
    } catch (err) {
      setActionError(formatQueryError(err));
    } finally {
      setSavingLog(false);
    }
  }

  const viewingFuture = isFuture(selectedDate);
  const readOnly = viewingFuture || Boolean(state?.locked);
  const error =
    actionError ?? (queryError ? formatQueryError(queryError) : null);
  const loading = isLoading || (isFetching && !state);

  if (isLoading && !state) {
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
      <div className="px-5 py-6 text-danger text-sm">
        {error ?? "Unable to load today."}
      </div>
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
      filled: Boolean(
        state.daily_log.book_title || state.daily_log.book_description
      ),
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
          disabled={loading}
          onChange={handleDateChange}
        />
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          animate={{ opacity: loading ? 0.55 : 1, x: 0 }}
          className="space-y-6"
          exit={{ opacity: 0, x: -12 }}
          initial={{ opacity: 0, x: loading ? 0 : 12 }}
          key={selectedDate}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <section className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4">
              <ProgressRing label="complete" value={state.progress} />
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-text-muted">Current streak</p>
                  <p className="font-semibold text-2xl">
                    {state.current_streak} days
                  </p>
                </div>
                <div>
                  <p className="text-text-muted">Habits tracked</p>
                  <p className="font-semibold text-2xl">
                    {state.entries.length}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {state.routines.length > 0 ? (
            <section className="space-y-3">
              <h3 className="font-medium text-sm text-text-secondary">
                {viewingFuture ? "Scheduled routines" : "Active routines"}
              </h3>
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface-2">
                {[...state.routines]
                  .sort((a, b) => a.start_time.localeCompare(b.start_time))
                  .map((routine) => (
                    <li
                      className="flex items-center gap-3 px-3 py-2.5"
                      key={routine.id}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: routine.color }}
                      />
                      <p className="min-w-0 flex-1 truncate font-medium text-sm">
                        {routine.title}
                      </p>
                      <p className="shrink-0 font-mono text-text-muted text-xs">
                        {routine.start_time}–{routine.end_time}
                      </p>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm text-text-secondary">
                Habits to avoid
              </h3>
              {state.locked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-accent text-xs">
                  <LockSimple size={14} weight="fill" />
                  Locked
                </span>
              )}
              {!state.locked && viewingFuture && (
                <span className="rounded-full bg-surface-3 px-2.5 py-1 text-text-muted text-xs">
                  Preview
                </span>
              )}
            </div>

            {state.entries.length === 0 ? (
              <div className="rounded-2xl border border-border border-dashed px-4 py-8 text-center text-sm text-text-muted">
                Add habits in Plan to start tracking today.
              </div>
            ) : (
              <div className="space-y-3">
                {state.entries.map((entry, index) => (
                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-border bg-surface-2 p-4"
                    initial={{ opacity: 0, y: 12 }}
                    key={entry.habit_id}
                    transition={{ delay: index * 0.04, duration: 0.35 }}
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
                        className={`focus-ring flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm transition active:scale-[0.98] ${
                          entry.status === "avoided"
                            ? "bg-success-soft text-success"
                            : "bg-surface-3 text-text-secondary hover:text-text-primary"
                        }`}
                        disabled={readOnly}
                        onClick={() => updateStatus(entry.habit_id, "avoided")}
                        type="button"
                      >
                        <CheckCircle size={18} weight="fill" />
                        Avoided
                      </button>
                      <button
                        className={`focus-ring flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm transition active:scale-[0.98] ${
                          entry.status === "slipped"
                            ? "bg-danger-soft text-danger"
                            : "bg-surface-3 text-text-secondary hover:text-text-primary"
                        }`}
                        disabled={readOnly}
                        onClick={() => updateStatus(entry.habit_id, "slipped")}
                        type="button"
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
            <h3 className="font-medium text-sm text-text-secondary">
              Daily log
            </h3>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface-2">
              {logRows.map((row) => {
                const Icon = row.icon;
                return (
                  <li key={row.key}>
                    <button
                      className="focus-ring flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-surface-3 active:scale-[0.99] disabled:cursor-default disabled:opacity-60"
                      disabled={readOnly}
                      onClick={() => openSheet(row.key)}
                      type="button"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-accent">
                        <Icon size={16} weight="fill" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-sm">
                          {row.label}
                        </span>
                        <span
                          className={`mt-0.5 block truncate text-xs ${
                            row.filled
                              ? "text-text-secondary"
                              : "text-text-muted"
                          }`}
                        >
                          {row.summary}
                        </span>
                      </span>
                      {readOnly ? null : (
                        <CaretRight
                          className="shrink-0 text-text-muted"
                          size={14}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {error ? (
            <p className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-danger text-sm">
              {error}
            </p>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <FormSheet
        onClose={closeSheet}
        onSave={saveSheet}
        open={activeSheet === "trading"}
        saving={savingLog}
        title="Trading profit"
      >
        <label className="block space-y-1.5">
          <span className="text-text-muted text-xs">
            Amount for this day (use negative for loss)
          </span>
          <input
            autoFocus
            className={sheetInputClass}
            onChange={(event) => {
              const raw = event.target.value;
              setDraft((current) => ({
                ...current,
                trading_profit: raw === "" ? null : Number.parseFloat(raw),
              }));
            }}
            placeholder="0.00"
            step="0.01"
            type="number"
            value={draft.trading_profit ?? ""}
          />
        </label>
      </FormSheet>

      <FormSheet
        onClose={closeSheet}
        onSave={saveSheet}
        open={activeSheet === "reading"}
        saving={savingLog}
        title="Reading"
      >
        <label className="block space-y-1.5">
          <span className="text-text-muted text-xs">Book title</span>
          <input
            autoFocus
            className={sheetInputClass}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((current) => ({
                ...current,
                book_title: value === "" ? null : value,
              }));
            }}
            placeholder="What are you reading?"
            type="text"
            value={draft.book_title ?? ""}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-text-muted text-xs">
            What did you read about?
          </span>
          <textarea
            className={`${sheetInputClass} resize-none`}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((current) => ({
                ...current,
                book_description: value === "" ? null : value,
              }));
            }}
            placeholder="A few lines on today's reading..."
            rows={4}
            value={draft.book_description ?? ""}
          />
        </label>
      </FormSheet>

      <FormSheet
        onClose={closeSheet}
        onSave={saveSheet}
        open={activeSheet === "water"}
        saving={savingLog}
        title="Water intake"
      >
        <label className="block space-y-1.5">
          <span className="text-text-muted text-xs">
            Milliliters for this day
          </span>
          <input
            autoFocus
            className={sheetInputClass}
            min={0}
            onChange={(event) => {
              const raw = event.target.value;
              setDraft((current) => ({
                ...current,
                water_ml: raw === "" ? null : Number.parseInt(raw, 10),
              }));
            }}
            placeholder="2500"
            step={100}
            type="number"
            value={draft.water_ml ?? ""}
          />
        </label>
      </FormSheet>
    </div>
  );
}
