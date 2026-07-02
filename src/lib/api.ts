import { invoke } from "@tauri-apps/api/core";
import type {
  Habit,
  HabitStatus,
  HealthResponse,
  Routine,
  Session,
  StatsState,
  TodayState,
  User,
} from "./types";

export function healthCheck() {
  return invoke<HealthResponse>("health_check");
}

export function register(email: string, password: string, display_name: string) {
  return invoke<Session>("register", { email, password, displayName: display_name });
}

export function login(email: string, password: string) {
  return invoke<Session>("login", { email, password });
}

export function logout(token: string) {
  return invoke<void>("logout", { token });
}

export function getMe(token: string) {
  return invoke<User>("get_me", { token });
}

export function listRoutines(token: string) {
  return invoke<Routine[]>("list_routines", { token });
}

export function createRoutine(
  token: string,
  payload: Omit<Routine, "id">,
) {
  return invoke<Routine>("create_routine", {
    token,
    title: payload.title,
    days: payload.days,
    startTime: payload.start_time,
    endTime: payload.end_time,
    color: payload.color,
    reminderEnabled: payload.reminder_enabled,
  });
}

export function updateRoutine(token: string, routine: Routine) {
  return invoke<Routine>("update_routine", { token, routine });
}

export function deleteRoutine(token: string, routine_id: string) {
  return invoke<void>("delete_routine", { token, routineId: routine_id });
}

export function listHabits(token: string) {
  return invoke<Habit[]>("list_habits", { token });
}

export function createHabit(token: string, title: string, color: string) {
  return invoke<Habit>("create_habit", { token, title, color });
}

export function updateHabit(token: string, habit: Habit) {
  return invoke<Habit>("update_habit", { token, habit });
}

export function deleteHabit(token: string, habit_id: string) {
  return invoke<void>("delete_habit", { token, habitId: habit_id });
}

export function getTodayState(token: string, date?: string) {
  return invoke<TodayState>("get_today_state", { token, date });
}

export function setHabitStatus(
  token: string,
  habit_id: string,
  date: string,
  status: HabitStatus,
) {
  return invoke<TodayState>("set_habit_status", {
    token,
    habitId: habit_id,
    date,
    status,
  });
}

export function lockDay(token: string, date: string) {
  return invoke<TodayState>("lock_day", { token, date });
}

export function getStats(token: string, weeks?: number) {
  return invoke<StatsState>("get_stats", { token, weeks });
}

export function getReminderSchedule(token: string) {
  return invoke<Array<{ routine_id: string; title: string; fire_at: string }>>(
    "get_reminder_schedule",
    { token },
  );
}

export function syncReminderSchedules(token: string) {
  return invoke<Array<{ routine_id: string; title: string; fire_at: string }>>(
    "sync_reminder_schedules",
    { token },
  );
}