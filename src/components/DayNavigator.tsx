import { CalendarBlank, CaretLeft, CaretRight } from "@phosphor-icons/react";
import clsx from "clsx";
import { useState } from "react";
import {
  addDays,
  formatCompactDate,
  isFuture,
  isToday,
  todayString,
} from "../lib/dates";
import { CalendarPicker } from "./CalendarPicker";

interface DayNavigatorProps {
  date: string;
  disabled?: boolean;
  onChange: (date: string) => void;
}

export function DayNavigator({ date, onChange, disabled }: DayNavigatorProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const atToday = isToday(date);
  const nextDate = addDays(date, 1);
  const canGoNext = !isFuture(nextDate);

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          aria-label="Previous day"
          className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-2 hover:text-text-primary active:scale-[0.96] disabled:opacity-40"
          disabled={disabled}
          onClick={() => onChange(addDays(date, -1))}
          type="button"
        >
          <CaretLeft size={16} weight="bold" />
        </button>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1.5">
          <button
            className="focus-ring min-w-0 truncate font-medium text-sm text-text-primary transition hover:text-accent disabled:opacity-40"
            disabled={disabled}
            onClick={() => setCalendarOpen(true)}
            type="button"
          >
            {formatCompactDate(date)}
          </button>
          {atToday ? (
            <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5 font-semibold text-[10px] text-accent uppercase tracking-wide">
              Today
            </span>
          ) : (
            <button
              className="focus-ring shrink-0 rounded-full px-1.5 py-0.5 font-semibold text-[10px] text-accent uppercase tracking-wide transition hover:brightness-110 disabled:opacity-40"
              disabled={disabled}
              onClick={() => onChange(todayString())}
              type="button"
            >
              Today
            </button>
          )}
        </div>

        <button
          aria-label="Open calendar"
          className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-2 hover:text-accent active:scale-[0.96] disabled:opacity-40"
          disabled={disabled}
          onClick={() => setCalendarOpen(true)}
          type="button"
        >
          <CalendarBlank size={16} weight="fill" />
        </button>

        <button
          aria-label="Next day"
          className={clsx(
            "focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-2 hover:text-text-primary active:scale-[0.96] disabled:opacity-40"
          )}
          disabled={disabled || !canGoNext}
          onClick={() => onChange(nextDate)}
          type="button"
        >
          <CaretRight size={16} weight="bold" />
        </button>
      </div>

      <CalendarPicker
        onClose={() => setCalendarOpen(false)}
        onSelect={onChange}
        open={calendarOpen}
        selected={date}
      />
    </>
  );
}
