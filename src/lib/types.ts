export type HabitStatus = "pending" | "avoided" | "slipped";

export interface User {
  display_name: string;
  email: string;
  id: string;
}

export interface Session {
  token: string;
  user: User;
}

export interface Routine {
  color: string;
  days: number[];
  end_time: string;
  id: string;
  reminder_enabled: boolean;
  start_time: string;
  title: string;
}

export interface Habit {
  active: boolean;
  color: string;
  id: string;
  title: string;
}

export interface HabitEntry {
  color: string;
  habit_id: string;
  status: HabitStatus;
  title: string;
}

export interface DailyLog {
  book_description: string | null;
  book_title: string | null;
  trading_profit: number | null;
  water_ml: number | null;
}

export interface TodayState {
  current_streak: number;
  daily_log: DailyLog;
  date: string;
  entries: HabitEntry[];
  locked: boolean;
  progress: number;
  routines: Routine[];
}

export interface HeatmapCell {
  avoided: number;
  completion_rate: number;
  date: string;
  slipped: number;
  total: number;
}

export interface HabitStreak {
  best_streak: number;
  current_streak: number;
  habit_id: string;
  title: string;
}

export interface StatsState {
  days_locked: number;
  heatmap: HeatmapCell[];
  streaks: HabitStreak[];
  total_avoided: number;
  total_slipped: number;
}

export interface HealthResponse {
  database: boolean;
  ok: boolean;
  version: string;
}

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
