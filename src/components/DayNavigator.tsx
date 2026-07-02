import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import clsx from "clsx";
import { addDays, formatDayHeading, isFuture, isToday, todayString } from "../lib/dates";

interface DayNavigatorProps {
  date: string;
  onChange: (date: string) => void;
  disabled?: boolean;
}

export function DayNavigator({ date, onChange, disabled }: DayNavigatorProps) {
  const atToday = isToday(date);
  const nextDate = addDays(date, 1);
  const canGoNext = !isFuture(nextDate);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(addDays(date, -1))}
          aria-label="Previous day"
          className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-text-secondary transition hover:border-border-strong hover:text-text-primary active:scale-[0.96] disabled:opacity-40"
        >
          <CaretLeft size={18} weight="bold" />
        </button>

        <div className="min-w-0 flex-1 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
            {atToday ? "Today" : isFuture(date) ? "Upcoming" : "Day view"}
          </p>
          <h2 className="truncate text-lg font-semibold tracking-tight">
            {formatDayHeading(date)}
          </h2>
        </div>

        <button
          type="button"
          disabled={disabled || !canGoNext}
          onClick={() => onChange(nextDate)}
          aria-label="Next day"
          className={clsx(
            "focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-text-secondary transition hover:border-border-strong hover:text-text-primary active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40",
            !canGoNext && "opacity-40",
          )}
        >
          <CaretRight size={18} weight="bold" />
        </button>
      </div>

      {!atToday ? (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(todayString())}
            className="focus-ring rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-medium text-accent transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
          >
            Jump to today
          </button>
        </div>
      ) : null}
    </div>
  );
}