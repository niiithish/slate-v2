export interface ReminderPreferences {
  eveningHour: number;
  eveningMinute: number;
  eveningReminderEnabled: boolean;
  routineOffsetMinutes: number;
  waterRemindersEnabled: boolean;
}

const STORAGE_KEY = "slate.reminderPreferences";

export const ROUTINE_OFFSET_OPTIONS = [
  { label: "When activity starts", value: 0 },
  { label: "5 minutes before", value: 5 },
  { label: "10 minutes before", value: 10 },
  { label: "15 minutes before", value: 15 },
  { label: "30 minutes before", value: 30 },
] as const;

export const DEFAULT_REMINDER_PREFERENCES: ReminderPreferences = {
  routineOffsetMinutes: 0,
  eveningReminderEnabled: true,
  eveningHour: 22,
  eveningMinute: 0,
  waterRemindersEnabled: true,
};

function normalizeReminderPreferences(
  preferences: Partial<ReminderPreferences>
): ReminderPreferences {
  const routineOffsetMinutes = preferences.routineOffsetMinutes;
  const eveningHour = preferences.eveningHour;
  const eveningMinute = preferences.eveningMinute;

  return {
    routineOffsetMinutes:
      typeof routineOffsetMinutes === "number" &&
      !Number.isNaN(routineOffsetMinutes)
        ? Math.min(180, Math.max(0, routineOffsetMinutes))
        : DEFAULT_REMINDER_PREFERENCES.routineOffsetMinutes,
    eveningReminderEnabled:
      preferences.eveningReminderEnabled ??
      DEFAULT_REMINDER_PREFERENCES.eveningReminderEnabled,
    eveningHour:
      typeof eveningHour === "number" && !Number.isNaN(eveningHour)
        ? Math.min(23, Math.max(0, eveningHour))
        : DEFAULT_REMINDER_PREFERENCES.eveningHour,
    eveningMinute:
      typeof eveningMinute === "number" && !Number.isNaN(eveningMinute)
        ? Math.min(59, Math.max(0, eveningMinute))
        : DEFAULT_REMINDER_PREFERENCES.eveningMinute,
    waterRemindersEnabled:
      preferences.waterRemindersEnabled ??
      DEFAULT_REMINDER_PREFERENCES.waterRemindersEnabled,
  };
}

export function loadReminderPreferences(): ReminderPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_REMINDER_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_REMINDER_PREFERENCES;
    }
    const parsed = JSON.parse(raw) as Partial<ReminderPreferences>;
    return normalizeReminderPreferences(parsed);
  } catch {
    return DEFAULT_REMINDER_PREFERENCES;
  }
}

export function saveReminderPreferences(preferences: ReminderPreferences) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

export function toReminderPreferencesPayload(preferences: ReminderPreferences) {
  return {
    routineOffsetMinutes: preferences.routineOffsetMinutes,
    eveningReminderEnabled: preferences.eveningReminderEnabled,
    eveningHour: preferences.eveningHour,
    eveningMinute: preferences.eveningMinute,
    waterRemindersEnabled: preferences.waterRemindersEnabled,
  };
}

export function formatEveningTime(preferences: ReminderPreferences): string {
  const hour = String(preferences.eveningHour).padStart(2, "0");
  const minute = String(preferences.eveningMinute).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function parseEveningTime(
  value: string
): Pick<ReminderPreferences, "eveningHour" | "eveningMinute"> {
  const [hourPart, minutePart] = value.split(":");
  const eveningHour = Number.parseInt(hourPart ?? "22", 10);
  const eveningMinute = Number.parseInt(minutePart ?? "0", 10);
  return {
    eveningHour: Number.isNaN(eveningHour)
      ? 22
      : Math.min(23, Math.max(0, eveningHour)),
    eveningMinute: Number.isNaN(eveningMinute)
      ? 0
      : Math.min(59, Math.max(0, eveningMinute)),
  };
}
