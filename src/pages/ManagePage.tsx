import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CalendarBlank, Plus, Prohibit, Trash, X } from "@phosphor-icons/react";
import clsx from "clsx";
import { ColorSwatches } from "../components/ColorSwatches";
import { useConfirm } from "../components/ConfirmDialog";
import * as api from "../lib/api";
import { DAY_LABELS, type Habit, type Routine } from "../lib/types";

interface ManagePageProps {
  token: string;
}

type PlanTab = "routines" | "habits";

const DAY_SHORT = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const ROUTINE_COLORS = ["#6BDA0A", "#3B82F6", "#A855F7", "#F59E0B", "#EC4899", "#14B8A6"];
const HABIT_COLORS = ["#EF4444", "#F97316", "#8B5CF6", "#06B6D4", "#F43F5E", "#84CC16"];

const inputClass =
  "focus-ring w-full rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted";

export function ManagePage({ token }: ManagePageProps) {
  const [tab, setTab] = useState<PlanTab>("routines");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
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
  const { confirm, dialog: confirmDialog } = useConfirm();

  async function refresh() {
    const [nextRoutines, nextHabits] = await Promise.all([
      api.listRoutines(token),
      api.listHabits(token),
    ]);
    setRoutines(nextRoutines);
    setHabits(nextHabits);
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [token]);

  function toggleDay(day: number) {
    setSelectedDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort(),
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
    if (!routineTitle.trim() || selectedDays.length === 0) return;
    setSaving(true);
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
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function addHabit() {
    if (!habitTitle.trim()) return;
    setSaving(true);
    try {
      await api.createHabit(token, habitTitle.trim(), habitColor);
      resetHabitForm();
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-5 py-6 pb-28">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-text-muted">Plan</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">Your schedule</h2>
      </header>

      <div className="mb-6 flex rounded-lg border border-border bg-surface-1 p-1">
        {(
          [
            { key: "routines" as const, label: "Routines", icon: CalendarBlank },
            { key: "habits" as const, label: "Avoid", icon: Prohibit },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={clsx(
              "focus-ring flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition",
              tab === key
                ? "bg-surface-3 text-text-primary"
                : "text-text-muted hover:text-text-secondary",
            )}
          >
            <Icon size={16} weight={tab === key ? "fill" : "regular"} />
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === "routines" ? (
          <motion.div
            key="routines"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {routines.length === 0 && !addingRoutine ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
                <CalendarBlank size={28} className="mx-auto text-text-muted" />
                <p className="mt-3 text-sm text-text-secondary">No routines yet</p>
                <p className="mt-1 text-xs text-text-muted">
                  Block out weekly time windows you want to protect.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {routines.map((routine) => (
                  <li key={routine.id} className="flex items-stretch gap-0">
                    <span
                      className="w-1 shrink-0 rounded-l-xl"
                      style={{ backgroundColor: routine.color }}
                    />
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{routine.title}</p>
                        <p className="mt-0.5 font-mono text-xs text-text-muted">
                          {routine.days.map((d) => DAY_SHORT[d]).join(" · ")}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-text-secondary">
                          {routine.start_time} → {routine.end_time}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          confirm({
                            title: "Delete routine?",
                            message: `"${routine.title}" will be removed from your schedule.`,
                            confirmLabel: "Delete",
                            variant: "danger",
                            onConfirm: async () => {
                              await api.deleteRoutine(token, routine.id);
                              await refresh();
                            },
                          })
                        }
                        className="focus-ring shrink-0 rounded-lg p-2 text-text-muted transition hover:bg-surface-2 hover:text-danger"
                        aria-label={`Delete ${routine.title}`}
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <AnimatePresence>
              {addingRoutine ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 rounded-xl border border-border bg-surface-1 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">New routine</p>
                      <button
                        type="button"
                        onClick={cancelRoutineForm}
                        className="focus-ring rounded-lg p-1.5 text-text-muted hover:text-text-primary"
                        aria-label="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <input
                      value={routineTitle}
                      onChange={(e) => setRoutineTitle(e.target.value)}
                      placeholder="Morning deep work"
                      className={inputClass}
                      autoFocus
                    />

                    <div>
                      <p className="mb-2 text-xs text-text-muted">Days</p>
                      <div className="flex gap-1.5">
                        {DAY_LABELS.map((label, index) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => toggleDay(index)}
                            className={clsx(
                              "focus-ring flex h-9 w-9 items-center justify-center rounded-lg border text-[11px] font-medium transition",
                              selectedDays.includes(index)
                                ? "border-accent/40 bg-accent-soft text-accent"
                                : "border-border text-text-muted hover:border-border-strong hover:text-text-secondary",
                            )}
                          >
                            {DAY_SHORT[index]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-2">
                        <span className="text-xs text-text-muted">Start</span>
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className={inputClass}
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs text-text-muted">End</span>
                        <input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className={inputClass}
                        />
                      </label>
                    </div>

                    <div>
                      <p className="mb-2 text-xs text-text-muted">Color</p>
                      <ColorSwatches
                        colors={ROUTINE_COLORS}
                        value={routineColor}
                        onChange={setRoutineColor}
                      />
                    </div>

                    <button
                      type="button"
                      disabled={saving || !routineTitle.trim() || selectedDays.length === 0}
                      onClick={addRoutine}
                      className="focus-ring w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-surface-0 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                    >
                      Save routine
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {!addingRoutine ? (
              <button
                type="button"
                onClick={() => setAddingRoutine(true)}
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm text-text-secondary transition hover:border-border-strong hover:text-text-primary"
              >
                <Plus size={16} weight="bold" />
                Add routine
              </button>
            ) : null}
          </motion.div>
        ) : (
          <motion.div
            key="habits"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {habits.length === 0 && !addingHabit ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
                <Prohibit size={28} className="mx-auto text-text-muted" />
                <p className="mt-3 text-sm text-text-secondary">No habits to track</p>
                <p className="mt-1 text-xs text-text-muted">
                  Add behaviors you want to avoid each day.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {habits.map((habit) => (
                  <li
                    key={habit.id}
                    className="flex items-center justify-between gap-3 px-4 py-3.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: habit.color }}
                      />
                      <p className="truncate font-medium">{habit.title}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        confirm({
                          title: "Delete habit?",
                          message: `"${habit.title}" and its tracking history will be removed.`,
                          confirmLabel: "Delete",
                          variant: "danger",
                          onConfirm: async () => {
                            await api.deleteHabit(token, habit.id);
                            await refresh();
                          },
                        })
                      }
                      className="focus-ring shrink-0 rounded-lg p-2 text-text-muted transition hover:bg-surface-2 hover:text-danger"
                      aria-label={`Delete ${habit.title}`}
                    >
                      <Trash size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <AnimatePresence>
              {addingHabit ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 rounded-xl border border-border bg-surface-1 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">New habit to avoid</p>
                      <button
                        type="button"
                        onClick={cancelHabitForm}
                        className="focus-ring rounded-lg p-1.5 text-text-muted hover:text-text-primary"
                        aria-label="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <input
                      value={habitTitle}
                      onChange={(e) => setHabitTitle(e.target.value)}
                      placeholder="Late-night scrolling"
                      className={inputClass}
                      autoFocus
                    />

                    <div>
                      <p className="mb-2 text-xs text-text-muted">Color</p>
                      <ColorSwatches
                        colors={HABIT_COLORS}
                        value={habitColor}
                        onChange={setHabitColor}
                      />
                    </div>

                    <button
                      type="button"
                      disabled={saving || !habitTitle.trim()}
                      onClick={addHabit}
                      className="focus-ring w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-surface-0 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                    >
                      Save habit
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {!addingHabit ? (
              <button
                type="button"
                onClick={() => setAddingHabit(true)}
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm text-text-secondary transition hover:border-border-strong hover:text-text-primary"
              >
                <Plus size={16} weight="bold" />
                Add habit
              </button>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
      {confirmDialog}
    </div>
  );
}