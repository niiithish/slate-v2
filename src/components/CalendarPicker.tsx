import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  addMonths,
  formatMonthYear,
  getMonthGrid,
  isToday,
  parseDate,
} from "../lib/dates";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

interface CalendarPickerProps {
  onClose: () => void;
  onSelect: (date: string) => void;
  open: boolean;
  selected: string;
}

export function CalendarPicker({
  open,
  selected,
  onSelect,
  onClose,
}: CalendarPickerProps) {
  const selectedParts = parseDate(selected);
  const [viewYear, setViewYear] = useState(selectedParts.year);
  const [viewMonth, setViewMonth] = useState(selectedParts.month);

  useEffect(() => {
    if (!open) {
      return;
    }
    const parts = parseDate(selected);
    setViewYear(parts.year);
    setViewMonth(parts.month);
  }, [open, selected]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (typeof document === "undefined") {
    return null;
  }

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
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pt-16 pb-6 backdrop-blur-sm sm:items-center"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onClick={onClose}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            aria-label="Choose a day"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl border border-border bg-surface-1 p-4 shadow-2xl"
            exit={{ opacity: 0, y: 24 }}
            initial={{ opacity: 0, y: 24 }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <button
                aria-label="Previous month"
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-text-secondary transition hover:text-text-primary"
                onClick={() => shiftMonth(-1)}
                type="button"
              >
                <CaretLeft size={16} weight="bold" />
              </button>
              <p className="font-semibold text-sm text-text-primary">
                {formatMonthYear(viewYear, viewMonth)}
              </p>
              <button
                aria-label="Next month"
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-text-secondary transition hover:text-text-primary"
                onClick={() => shiftMonth(1)}
                type="button"
              >
                <CaretRight size={16} weight="bold" />
              </button>
              <button
                aria-label="Close calendar"
                className="focus-ring ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-2 hover:text-text-primary"
                onClick={onClose}
                type="button"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((label) => (
                <div
                  className="py-1 text-center font-medium text-[10px] text-text-muted uppercase tracking-wide"
                  key={label}
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
                    className={clsx(
                      "focus-ring flex h-9 items-center justify-center rounded-lg text-sm transition active:scale-[0.96]",
                      !cell.inMonth && "text-text-muted/40",
                      cell.inMonth &&
                        !selectedDay &&
                        "text-text-secondary hover:bg-surface-2",
                      selectedDay && "bg-accent font-semibold text-surface-0",
                      today && !selectedDay && "ring-1 ring-accent/40"
                    )}
                    key={cell.date}
                    onClick={() => {
                      onSelect(cell.date);
                      onClose();
                    }}
                    type="button"
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
    document.body
  );
}
