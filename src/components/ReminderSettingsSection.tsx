import { Bell } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import * as api from "../lib/api";
import {
  DEFAULT_REMINDER_PREFERENCES,
  formatEveningTime,
  loadReminderPreferences,
  parseEveningTime,
  type ReminderPreferences,
  ROUTINE_OFFSET_OPTIONS,
  saveReminderPreferences,
  toReminderPreferencesPayload,
} from "../lib/reminderPreferences";
import {
  clearReminderSyncError,
  getReminderSyncError,
  syncReminders,
} from "../lib/reminders";

interface ReminderSettingsSectionProps {
  token: string;
}

interface ScheduledReminder {
  fireAt: string;
  routineId: string;
  title: string;
}

export function ReminderSettingsSection({
  token,
}: ReminderSettingsSectionProps) {
  const [reminders, setReminders] = useState<ScheduledReminder[]>([]);
  const [reminderPrefs, setReminderPrefs] = useState<ReminderPreferences>(
    DEFAULT_REMINDER_PREFERENCES
  );
  const [customOffset, setCustomOffset] = useState("20");
  const [customOffsetMode, setCustomOffsetMode] = useState(false);
  const [eveningTimeInput, setEveningTimeInput] = useState(
    formatEveningTime(DEFAULT_REMINDER_PREFERENCES)
  );
  const [reminderStatus, setReminderStatus] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadReminderPreferences();
    setReminderPrefs(loaded);
    setEveningTimeInput(formatEveningTime(loaded));
    const usingCustomOffset = ROUTINE_OFFSET_OPTIONS.every(
      (option) => option.value !== loaded.routineOffsetMinutes
    );
    setCustomOffsetMode(usingCustomOffset);
    if (usingCustomOffset) {
      setCustomOffset(String(loaded.routineOffsetMinutes));
    }
    const syncError = getReminderSyncError();
    if (syncError) {
      setReminderStatus(syncError);
    }
  }, []);

  useEffect(() => {
    const preferences = toReminderPreferencesPayload(reminderPrefs);
    api
      .getReminderSchedule(token, preferences)
      .then((items) =>
        setReminders(
          items.map((item) => ({
            routineId: item.routine_id,
            title: item.title,
            fireAt: item.fire_at,
          }))
        )
      )
      .catch(() => setReminders([]));
  }, [token, reminderPrefs]);

  function persistReminderPreferences(next: ReminderPreferences) {
    setReminderPrefs(next);
    saveReminderPreferences(next);
    setEveningTimeInput(formatEveningTime(next));
    clearReminderSyncError();
    setReminderStatus("Saving reminder schedule…");
    syncReminders(token)
      .then(() =>
        api.getReminderSchedule(token, toReminderPreferencesPayload(next))
      )
      .then((items) => {
        setReminders(
          items.map((item) => ({
            routineId: item.routine_id,
            title: item.title,
            fireAt: item.fire_at,
          }))
        );
        setReminderStatus("Reminders updated on this device.");
      })
      .catch(() => {
        setReminderStatus(
          getReminderSyncError() ??
            "Could not refresh reminders. Open the app again to retry."
        );
      });
  }

  return (
    <section className="glass-panel space-y-4 rounded-2xl p-5">
      <div className="flex items-center gap-2 font-medium text-sm">
        <Bell className="text-accent" size={18} />
        Notifications
      </div>
      <p className="text-text-muted text-xs leading-relaxed">
        Routine alerts fire for enabled routines in Plan. Evening check-ins list
        habits and logs you have not filled yet.
      </p>

      <label className="block space-y-2">
        <span className="font-medium text-sm">Routine reminder</span>
        <select
          className="focus-ring w-full rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-sm"
          onChange={(event) => {
            const value = Number.parseInt(event.target.value, 10);
            if (value === -1) {
              setCustomOffsetMode(true);
              if (!customOffsetMode) {
                setCustomOffset(String(reminderPrefs.routineOffsetMinutes));
              }
              return;
            }
            setCustomOffsetMode(false);
            persistReminderPreferences({
              ...reminderPrefs,
              routineOffsetMinutes: value,
            });
          }}
          value={customOffsetMode ? -1 : reminderPrefs.routineOffsetMinutes}
        >
          {ROUTINE_OFFSET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value={-1}>Custom</option>
        </select>
      </label>

      {customOffsetMode ? (
        <label className="block space-y-2">
          <span className="font-medium text-sm">Custom minutes before</span>
          <input
            className="focus-ring w-full rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-sm"
            inputMode="numeric"
            min={0}
            onBlur={() => {
              const minutes = Number.parseInt(customOffset, 10);
              if (Number.isNaN(minutes)) {
                return;
              }
              persistReminderPreferences({
                ...reminderPrefs,
                routineOffsetMinutes: Math.min(180, Math.max(0, minutes)),
              });
            }}
            onChange={(event) => setCustomOffset(event.target.value)}
            type="number"
            value={customOffset}
          />
        </label>
      ) : null}

      <label className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-sm">Evening check-in</p>
          <p className="mt-1 text-text-muted text-xs">
            Remind me to finish pending habits and daily logs.
          </p>
        </div>
        <button
          aria-checked={reminderPrefs.eveningReminderEnabled}
          className={`focus-ring relative h-7 w-12 shrink-0 rounded-full transition ${
            reminderPrefs.eveningReminderEnabled ? "bg-accent" : "bg-surface-3"
          }`}
          onClick={() => {
            persistReminderPreferences({
              ...reminderPrefs,
              eveningReminderEnabled: !reminderPrefs.eveningReminderEnabled,
            });
          }}
          role="switch"
          type="button"
        >
          <span
            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
              reminderPrefs.eveningReminderEnabled
                ? "translate-x-5"
                : "translate-x-0"
            }`}
          />
        </button>
      </label>

      {reminderPrefs.eveningReminderEnabled ? (
        <label className="block space-y-2">
          <span className="font-medium text-sm">Evening reminder time</span>
          <input
            className="focus-ring w-full rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-sm"
            onBlur={() => {
              const parsed = parseEveningTime(eveningTimeInput);
              persistReminderPreferences({
                ...reminderPrefs,
                ...parsed,
              });
            }}
            onChange={(event) => setEveningTimeInput(event.target.value)}
            type="time"
            value={eveningTimeInput}
          />
        </label>
      ) : null}

      <label className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-sm">Water reminders</p>
          <p className="mt-1 text-text-muted text-xs">
            Every 6 hours until water is logged for the day.
          </p>
        </div>
        <button
          aria-checked={reminderPrefs.waterRemindersEnabled}
          className={`focus-ring relative h-7 w-12 shrink-0 rounded-full transition ${
            reminderPrefs.waterRemindersEnabled ? "bg-accent" : "bg-surface-3"
          }`}
          onClick={() => {
            persistReminderPreferences({
              ...reminderPrefs,
              waterRemindersEnabled: !reminderPrefs.waterRemindersEnabled,
            });
          }}
          role="switch"
          type="button"
        >
          <span
            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
              reminderPrefs.waterRemindersEnabled
                ? "translate-x-5"
                : "translate-x-0"
            }`}
          />
        </button>
      </label>

      {reminderStatus ? (
        <p className="text-text-muted text-xs">{reminderStatus}</p>
      ) : null}

      <div className="border-border border-t pt-4">
        <p className="mb-2 font-medium text-sm text-text-secondary">
          Scheduled on this device
        </p>
        {reminders.length === 0 ? (
          <p className="text-sm text-text-muted">No scheduled reminders yet.</p>
        ) : (
          <ul className="space-y-2 text-sm text-text-secondary">
            {reminders.map((item) => (
              <li
                className="rounded-xl bg-surface-2 px-3 py-2"
                key={`${item.routineId}:${item.fireAt}`}
              >
                {item.title} at {item.fireAt}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
