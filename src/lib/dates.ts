/** Local calendar date as YYYY-MM-DD (avoids UTC drift from toISOString). */
export function todayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: string, delta: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(year, month - 1, day + delta);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isToday(date: string): boolean {
  return date === todayString();
}

export function isFuture(date: string): boolean {
  return date > todayString();
}

export function formatDayHeading(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatCompactDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function parseDate(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

export function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export interface CalendarCell {
  date: string;
  inMonth: boolean;
}

/** Monday-first month grid (42 cells). */
export function getMonthGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startOffset = (first.getDay() + 6) % 7;
  const cells: CalendarCell[] = [];

  for (let index = 0; index < 42; index += 1) {
    const dayNumber = index - startOffset + 1;
    if (dayNumber < 1) {
      const prev = new Date(year, month - 1, dayNumber);
      cells.push({
        date: toDateString(prev.getFullYear(), prev.getMonth() + 1, prev.getDate()),
        inMonth: false,
      });
      continue;
    }
    if (dayNumber > daysInMonth) {
      const next = new Date(year, month - 1, dayNumber);
      cells.push({
        date: toDateString(next.getFullYear(), next.getMonth() + 1, next.getDate()),
        inMonth: false,
      });
      continue;
    }
    cells.push({ date: toDateString(year, month, dayNumber), inMonth: true });
  }

  return cells;
}

export function formatMonthYear(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}