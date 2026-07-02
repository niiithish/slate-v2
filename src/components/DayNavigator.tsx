import { useState } from "react";
import { CalendarBlank, CaretLeft, CaretRight } from "@phosphor-icons/react";
import clsx from "clsx";
import { CalendarPicker } from "./CalendarPicker";
import { addDays, formatCompactDate, isFuture, isToday, todayString } from "../lib/dates";

interface DayNavigatorProps {
  date: string;
  onChange: (date: string) => void;
  disabled?: boolean;
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
          type="button"
          disabled={disabled}
          onClick={() => onChange(addDays(date, -1))}
          aria-label="Previous day"
          className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-2 hover:text-text-primary active:scale-[0.96] disabled:opacity-40"
        >
          <CaretLeft size={16} weight="bold" />
        </button>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setCalendarOpen(true)}
            className="focus-ring min-w-0 truncate text-sm font-medium text-text-primary transition hover:text-accent disabled:opacity-40"
          >
            {formatCompactDate(date)}
          </button>
          {atToday ? (
            <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
              Today
            </span>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(todayString())}
              className="focus-ring shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent transition hover:brightness-110 disabled:opacity-40"
            >
              Today
            </button>
          )}
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => setCalendarOpen(true)}
          aria-label="Open calendar"
          className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-2 hover:text-accent active:scale-[0.96] disabled:opacity-40"
        >
          <CalendarBlank size={16} weight="fill" />
        </button>

        <button
          type="button"
          disabled={disabled || !canGoNext}
          onClick={() => onChange(nextDate)}
          aria-label="Next day"
          className={clsx(
            "focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-2 hover:text-text-primary active:scale-[0.96] disabled:opacity-40",
          )}
        >
          <CaretRight size={16} weight="bold" />
        </button>
      </div>

      <CalendarPicker
        open={calendarOpen}
        selected={date}
        onSelect={onChange}
        onClose={() => setCalendarOpen(false)}
      />
    </>
  );
}