import { CalendarBlank, Plus, Prohibit, Trash, X } from "@phosphor-icons/react";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ColorSwatches } from "../components/ColorSwatches";
import { useConfirm } from "../components/ConfirmDialog";
import * as api from "../lib/api";
import { formatInvokeError } from "../lib/errors";
import { useHabits, useRoutines } from "../lib/queries";
import { invalidateAfterPlanChange } from "../lib/queryClient";
import { syncReminders } from "../lib/reminders";
import { DAY_LABELS } from "../lib/types";

interface ManagePageProps {
  token: string;
}

type PlanTab = "routines" | "habits";

const DAY_SHORT = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const ROUTINE_COLORS = [
  "#6BDA0A",
  "#3B82F6",
  "#A855F7",
  "#F59E0B",
  "#EC4899",
  "#14B8A6",
];
const HABIT_COLORS = [
  "#EF4444",
  "#F97316",
  "#8B5CF6",
  "#06B6D4",
  "#F43F5E",
  "#84CC16",
];

const inputClass =
  "focus-ring w-full rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted";

export function ManagePage({ token }: ManagePageProps) {
  const [tab, setTab] = useState<PlanTab>("routines");
  const { data: routines = [], isPending: routinesLoading } =
    useRoutines(token);
  const { data: habits = [], isPending: habitsLoading } = useHabits(token);
  const planLoading = routinesLoading || habitsLoading;
  const [addingRoutine, setAddingRoutine] = useState(false);
  const [addingHabit, setAddingHabit] = useState(false);

  const [routineTitle, setRoutineTitle] = useState("");
  const [habitTitle, setHabitTitle] = useState("");
  const [routineColor, setRoutineColor] = useState(ROUTINE_COLORS[0]);
  const [habitColor, setHabitColor] = useState(HABIT_COLORS[0]);
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  async function refreshPlanData() {
    await invalidateAfterPlanChange(token);
  }

  function toggleDay(day: number) {
    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort()
    );
  }

  function resetRoutineForm() {
    setRoutineTitle("");
    setRoutineColor(ROUTINE_COLORS[0]);
    setSelectedDays([0, 1, 2, 3, 4]);
    setStartTime("08:00");
    setEndTime("09:00");
    setAddingRoutine(false);
  }

  function resetHabitForm() {
    setHabitTitle("");
    setHabitColor(HABIT_COLORS[0]);
    setAddingHabit(false);
  }

  function cancelRoutineForm() {
    if (routineTitle.trim()) {
      confirm({
        title: "Discard routine?",
        message: "Your unsaved routine will be lost.",
        confirmLabel: "Discard",
        variant: "danger",
        onConfirm: async () => resetRoutineForm(),
      });
      return;
    }
    resetRoutineForm();
  }

  function cancelHabitForm() {
    if (habitTitle.trim()) {
      confirm({
        title: "Discard habit?",
        message: "Your unsaved habit will be lost.",
        confirmLabel: "Discard",
        variant: "danger",
        onConfirm: async () => resetHabitForm(),
      });
      return;
    }
    resetHabitForm();
  }

  async function addRoutine() {
    if (!routineTitle.trim() || selectedDays.length === 0) {
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      await api.createRoutine(token, {
        title: routineTitle.trim(),
        days: selectedDays,
        start_time: startTime,
        end_time: endTime,
        color: routineColor,
        reminder_enabled: true,
      });
      resetRoutineForm();
      await refreshPlanData();
      await syncReminders(token);
    } catch (error) {
      setActionError(formatInvokeError(error));
    } finally {
      setSaving(false);
    }
  }

  async function addHabit() {
    if (!habitTitle.trim()) {
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      await api.createHabit(token, habitTitle.trim(), habitColor);
      resetHabitForm();
      await refreshPlanData();
    } catch (error) {
      setActionError(formatInvokeError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-5 pt-3 pb-28">
      <header className="mb-6">
        <p className="font-medium text-text-muted text-xs uppercase tracking-[0.14em]">
          Plan
        </p>
        <h2 className="mt-1 font-semibold text-2xl tracking-tight">
          Your schedule
        </h2>
      </header>

      {actionError ? (
        <p className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-danger text-sm">
          {actionError}
        </p>
      ) : null}

      <div className="mb-6 flex rounded-lg border border-border bg-surface-1 p-1">
        {(
          [
            {
              key: "routines" as const,
              label: "Routines",
              icon: CalendarBlank,
            },
            { key: "habits" as const, label: "Avoid", icon: Prohibit },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            className={clsx(
              "focus-ring flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 font-medium text-sm transition",
              tab === key
                ? "bg-surface-3 text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            )}
            key={key}
            onClick={() => setTab(key)}
            type="button"
          >
            <Icon size={16} weight={tab === key ? "fill" : "regular"} />
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === "routines" ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
            exit={{ opacity: 0, y: -6 }}
            initial={{ opacity: 0, y: 6 }}
            key="routines"
            transition={{ duration: 0.2 }}
          >
            {planLoading ? (
              <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
            ) : null}
            {!planLoading && routines.length === 0 && !addingRoutine ? (
              <div className="rounded-xl border border-border border-dashed px-4 py-10 text-center">
                <CalendarBlank className="mx-auto text-text-muted" size={28} />
                <p className="mt-3 text-sm text-text-secondary">
                  No routines yet
                </p>
                <p className="mt-1 text-text-muted text-xs">
                  Block out weekly time windows you want to protect.
                </p>
              </div>
            ) : null}
            {!planLoading && (routines.length > 0 || addingRoutine) ? (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {routines.map((routine) => (
                  <li className="flex items-stretch gap-0" key={routine.id}>
                    <span
                      className="w-1 shrink-0 rounded-l-xl"
                      style={{ backgroundColor: routine.color }}
                    />
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{routine.title}</p>
                        <p className="mt-0.5 font-mono text-text-muted text-xs">
                          {routine.days.map((d) => DAY_SHORT[d]).join(" · ")}
                        </p>
                        <p className="mt-0.5 font-mono text-text-secondary text-xs">
                          {routine.start_time} → {routine.end_time}
                        </p>
                      </div>
                      <button
                        aria-label={`Delete ${routine.title}`}
                        className="focus-ring shrink-0 rounded-lg p-2 text-text-muted transition hover:bg-surface-2 hover:text-danger"
                        onClick={() =>
                          confirm({
                            title: "Delete routine?",
                            message: `"${routine.title}" will be removed from your schedule.`,
                            confirmLabel: "Delete",
                            variant: "danger",
                            onConfirm: async () => {
                              try {
                                await api.deleteRoutine(token, routine.id);
                                await refreshPlanData();
                                await syncReminders(token);
                              } catch (error) {
                                setActionError(formatInvokeError(error));
                                throw error;
                              }
                            },
                          })
                        }
                        type="button"
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            <AnimatePresence>
              {addingRoutine ? (
                <motion.div
                  animate={{ opacity: 1, height: "auto" }}
                  className="overflow-hidden"
                  exit={{ opacity: 0, height: 0 }}
                  initial={{ opacity: 0, height: 0 }}
                >
                  <div className="space-y-4 rounded-xl border border-border bg-surface-1 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">New routine</p>
                      <button
                        aria-label="Cancel"
                        className="focus-ring rounded-lg p-1.5 text-text-muted hover:text-text-primary"
                        onClick={cancelRoutineForm}
                        type="button"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <input
                      autoFocus
                      className={inputClass}
                      onChange={(e) => setRoutineTitle(e.target.value)}
                      placeholder="Morning deep work"
                      value={routineTitle}
                    />

                    <div>
                      <p className="mb-2 text-text-muted text-xs">Days</p>
                      <div className="flex gap-1.5">
                        {DAY_LABELS.map((label, index) => (
                          <button
                            className={clsx(
                              "focus-ring flex h-9 w-9 items-center justify-center rounded-lg border font-medium text-[11px] transition",
                              selectedDays.includes(index)
                                ? "border-accent/40 bg-accent-soft text-accent"
                                : "border-border text-text-muted hover:border-border-strong hover:text-text-secondary"
                            )}
                            key={label}
                            onClick={() => toggleDay(index)}
                            type="button"
                          >
                            {DAY_SHORT[index]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-2">
                        <span className="text-text-muted text-xs">Start</span>
                        <input
                          className={inputClass}
                          onChange={(e) => setStartTime(e.target.value)}
                          type="time"
                          value={startTime}
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-text-muted text-xs">End</span>
                        <input
                          className={inputClass}
                          onChange={(e) => setEndTime(e.target.value)}
                          type="time"
                          value={endTime}
                        />
                      </label>
                    </div>

                    <div>
                      <p className="mb-2 text-text-muted text-xs">Color</p>
                      <ColorSwatches
                        colors={ROUTINE_COLORS}
                        onChange={setRoutineColor}
                        value={routineColor}
                      />
                    </div>

                    <button
                      className="focus-ring w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-sm text-surface-0 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                      disabled={
                        saving ||
                        !routineTitle.trim() ||
                        selectedDays.length === 0
                      }
                      onClick={addRoutine}
                      type="button"
                    >
                      Save routine
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {addingRoutine ? null : (
              <button
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg border border-border border-dashed py-3 text-sm text-text-secondary transition hover:border-border-strong hover:text-text-primary"
                onClick={() => setAddingRoutine(true)}
                type="button"
              >
                <Plus size={16} weight="bold" />
                Add routine
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
            exit={{ opacity: 0, y: -6 }}
            initial={{ opacity: 0, y: 6 }}
            key="habits"
            transition={{ duration: 0.2 }}
          >
            {planLoading ? (
              <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
            ) : null}
            {!planLoading && habits.length === 0 && !addingHabit ? (
              <div className="rounded-xl border border-border border-dashed px-4 py-10 text-center">
                <Prohibit className="mx-auto text-text-muted" size={28} />
                <p className="mt-3 text-sm text-text-secondary">
                  No habits to track
                </p>
                <p className="mt-1 text-text-muted text-xs">
                  Add behaviors you want to avoid each day.
                </p>
              </div>
            ) : null}
            {!planLoading && (habits.length > 0 || addingHabit) ? (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {habits.map((habit) => (
                  <li
                    className="flex items-center justify-between gap-3 px-4 py-3.5"
                    key={habit.id}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: habit.color }}
                      />
                      <p className="truncate font-medium">{habit.title}</p>
                    </div>
                    <button
                      aria-label={`Delete ${habit.title}`}
                      className="focus-ring shrink-0 rounded-lg p-2 text-text-muted transition hover:bg-surface-2 hover:text-danger"
                      onClick={() =>
                        confirm({
                          title: "Delete habit?",
                          message: `"${habit.title}" and its tracking history will be removed.`,
                          confirmLabel: "Delete",
                          variant: "danger",
                          onConfirm: async () => {
                            try {
                              await api.deleteHabit(token, habit.id);
                              await refreshPlanData();
                            } catch (error) {
                              setActionError(formatInvokeError(error));
                              throw error;
                            }
                          },
                        })
                      }
                      type="button"
                    >
                      <Trash size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <AnimatePresence>
              {addingHabit ? (
                <motion.div
                  animate={{ opacity: 1, height: "auto" }}
                  className="overflow-hidden"
                  exit={{ opacity: 0, height: 0 }}
                  initial={{ opacity: 0, height: 0 }}
                >
                  <div className="space-y-4 rounded-xl border border-border bg-surface-1 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">New habit to avoid</p>
                      <button
                        aria-label="Cancel"
                        className="focus-ring rounded-lg p-1.5 text-text-muted hover:text-text-primary"
                        onClick={cancelHabitForm}
                        type="button"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <input
                      autoFocus
                      className={inputClass}
                      onChange={(e) => setHabitTitle(e.target.value)}
                      placeholder="Late-night scrolling"
                      value={habitTitle}
                    />

                    <div>
                      <p className="mb-2 text-text-muted text-xs">Color</p>
                      <ColorSwatches
                        colors={HABIT_COLORS}
                        onChange={setHabitColor}
                        value={habitColor}
                      />
                    </div>

                    <button
                      className="focus-ring w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-sm text-surface-0 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                      disabled={saving || !habitTitle.trim()}
                      onClick={addHabit}
                      type="button"
                    >
                      Save habit
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {addingHabit ? null : (
              <button
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg border border-border border-dashed py-3 text-sm text-text-secondary transition hover:border-border-strong hover:text-text-primary"
                onClick={() => setAddingHabit(true)}
                type="button"
              >
                <Plus size={16} weight="bold" />
                Add habit
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {confirmDialog}
    </div>
  );
}
