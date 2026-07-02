export type HabitStatus = "pending" | "avoided" | "slipped";

export interface User {
  id: string;
  email: string;
  display_name: string;
}

export interface Session {
  token: string;
  user: User;
}

export interface Routine {
  id: string;
  title: string;
  days: number[];
  start_time: string;
  end_time: string;
  color: string;
  reminder_enabled: boolean;
}

export interface Habit {
  id: string;
  title: string;
  color: string;
  active: boolean;
}

export interface HabitEntry {
  habit_id: string;
  title: string;
  color: string;
  status: HabitStatus;
}

export interface DailyLog {
  trading_profit: number | null;
  book_title: string | null;
  book_description: string | null;
  water_ml: number | null;
}

export interface TodayState {
  date: string;
  locked: boolean;
  entries: HabitEntry[];
  progress: number;
  current_streak: number;
  routines: Routine[];
  daily_log: DailyLog;
}

export interface HeatmapCell {
  date: string;
  avoided: number;
  slipped: number;
  total: number;
  completion_rate: number;
}

export interface HabitStreak {
  habit_id: string;
  title: string;
  current_streak: number;
  best_streak: number;
}

export interface StatsState {
  heatmap: HeatmapCell[];
  streaks: HabitStreak[];
  total_avoided: number;
  total_slipped: number;
  days_locked: number;
}

export interface HealthResponse {
  ok: boolean;
  database: boolean;
  version: string;
}

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];