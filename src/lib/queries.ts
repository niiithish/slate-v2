import { useQuery } from "@tanstack/react-query";
import * as api from "./api";
import { queryKeys } from "./queryClient";
import type { DailyLog, TodayState } from "./types";

const EMPTY_DAILY_LOG: DailyLog = {
  trading_profit: null,
  book_title: null,
  book_description: null,
  water_ml: null,
};

export function normalizeTodayState(state: TodayState): TodayState {
  return {
    ...state,
    daily_log: state.daily_log ?? EMPTY_DAILY_LOG,
  };
}

export function useTodayState(token: string, date: string) {
  return useQuery({
    queryKey: queryKeys.today(token, date),
    queryFn: async () =>
      normalizeTodayState(await api.getTodayState(token, date)),
    enabled: Boolean(token),
  });
}

export function useStats(token: string) {
  return useQuery({
    queryKey: queryKeys.stats(token),
    queryFn: () => api.getStats(token, 12),
    enabled: Boolean(token),
  });
}

export function useRoutines(token: string) {
  return useQuery({
    queryKey: queryKeys.routines(token),
    queryFn: () => api.listRoutines(token),
    enabled: Boolean(token),
  });
}

export function useHabits(token: string) {
  return useQuery({
    queryKey: queryKeys.habits(token),
    queryFn: () => api.listHabits(token),
    enabled: Boolean(token),
  });
}

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health(),
    queryFn: () => api.healthCheck(),
    staleTime: 60 * 1000,
  });
}

export function formatHealthStatus(
  loading: boolean,
  result: Awaited<ReturnType<typeof api.healthCheck>> | undefined,
  errored = false
): string {
  if (loading) {
    return "checking";
  }
  if (errored) {
    return "Health check failed";
  }
  if (!result) {
    return "Health check failed";
  }
  return result.database ? "Turso connected" : "Database unavailable";
}
