import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import clsx from "clsx";
import {
  addMonths,
  formatMonthYear,
  getMonthGrid,
  isToday,
  parseDate,
} from "../lib/dates";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

interface CalendarPickerProps {
  open: boolean;
  selected: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}

export function CalendarPicker({ open, selected, onSelect, onClose }: CalendarPickerProps) {
  const selectedParts = parseDate(selected);
  const [viewYear, setViewYear] = useState(selectedParts.year);
  const [viewMonth, setViewMonth] = useState(selectedParts.month);

  useEffect(() => {
    if (!open) return;
    const parts = parseDate(selected);
    setViewYear(parts.year);
    setViewMonth(parts.month);
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  const cells = getMonthGrid(viewYear, viewMonth);

  function shiftMonth(delta: number) {
    const next = addMonths(viewYear, viewMonth, delta);
    setViewYear(next.year);
    setViewMonth(next.month);
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-6 pt-16 backdrop-blur-sm sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Choose a day"
            className="w-full max-w-sm rounded-2xl border border-border bg-surface-1 p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-text-secondary transition hover:text-text-primary"
              >
                <CaretLeft size={16} weight="bold" />
              </button>
              <p className="text-sm font-semibold text-text-primary">
                {formatMonthYear(viewYear, viewMonth)}
              </p>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-text-secondary transition hover:text-text-primary"
              >
                <CaretRight size={16} weight="bold" />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close calendar"
                className="focus-ring ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-2 hover:text-text-primary"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((label) => (
                <div
                  key={label}
                  className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-text-muted"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell) => {
                const day = parseDate(cell.date).day;
                const selectedDay = cell.date === selected;
                const today = isToday(cell.date);
                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => {
                      onSelect(cell.date);
                      onClose();
                    }}
                    className={clsx(
                      "focus-ring flex h-9 items-center justify-center rounded-lg text-sm transition active:scale-[0.96]",
                      !cell.inMonth && "text-text-muted/40",
                      cell.inMonth && !selectedDay && "text-text-secondary hover:bg-surface-2",
                      selectedDay && "bg-accent font-semibold text-surface-0",
                      today && !selectedDay && "ring-1 ring-accent/40",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}