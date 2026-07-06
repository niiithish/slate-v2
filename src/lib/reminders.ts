import * as api from "./api";
import {
  loadReminderPreferences,
  toReminderPreferencesPayload,
} from "./reminderPreferences";

let lastSyncError: string | null = null;

export function getReminderSyncError(): string | null {
  return lastSyncError;
}

export function clearReminderSyncError() {
  lastSyncError = null;
}

export async function syncReminders(token: string) {
  const preferences = loadReminderPreferences();
  try {
    const result = await api.syncReminderSchedules(
      token,
      toReminderPreferencesPayload(preferences)
    );
    lastSyncError = null;
    return result;
  } catch (error) {
    lastSyncError =
      error instanceof Error ? error.message : "Reminder sync failed";
    throw error;
  }
}
