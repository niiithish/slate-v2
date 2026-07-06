import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const queryKeys = {
  today: (token: string, date: string) => ["today", token, date] as const,
  stats: (token: string) => ["stats", token] as const,
  routines: (token: string) => ["routines", token] as const,
  habits: (token: string) => ["habits", token] as const,
  health: () => ["health"] as const,
};

const DATA_QUERY_ROOTS = new Set(["today", "stats", "routines", "habits"]);

export function invalidateSyncedData() {
  return queryClient.invalidateQueries({
    predicate: (query) =>
      typeof query.queryKey[0] === "string" &&
      DATA_QUERY_ROOTS.has(query.queryKey[0]),
  });
}

export function invalidateAfterPlanChange(token: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["today", token] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.stats(token) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.routines(token) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.habits(token) }),
  ]);
}

export function invalidateAfterTodayChange(token: string, date: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.today(token, date) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.stats(token) }),
  ]);
}
