import { motion, useReducedMotion } from "motion/react";
import type { TodayState } from "../lib/types";
import { isFuture, isToday } from "../lib/dates";

type CompanionMood = "idle" | "happy" | "locked" | "future" | "cheer";

interface DayCompanionProps {
  state: TodayState;
  date: string;
}

function resolveMood(state: TodayState, date: string): CompanionMood {
  if (isFuture(date)) return "future";
  if (state.locked) return "locked";
  if (state.progress >= 100 && state.entries.length > 0) return "cheer";
  if (state.progress >= 50) return "happy";
  return "idle";
}

export function companionMessage(state: TodayState, date: string): string {
  if (isFuture(date)) {
    return "This day hasn't arrived yet. I'll be here when it does.";
  }
  if (state.locked) {
    return "Locked in — this day is sealed. Nice discipline.";
  }
  if (state.entries.length === 0) {
    return "Add habits in Plan and I'll walk you through each day.";
  }
  if (state.progress >= 100) {
    return "Every habit marked. Lock the day when you're done reviewing.";
  }
  if (!isToday(date)) {
    return `Browsing ${formatShort(date)}. Update anything still open, or just reflect.`;
  }
  if (state.current_streak > 2) {
    return `${state.current_streak}-day streak — you're building real momentum.`;
  }
  if (state.progress > 0) {
    return `${Math.round(state.progress)}% through today's habits. One block at a time.`;
  }
  return "Routines are lined up. Mark habits as you move through your day.";
}

function formatShort(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function CompanionCharacter({ mood }: { mood: CompanionMood }) {
  const eyeScale = mood === "cheer" ? 1.15 : mood === "future" ? 0.9 : 1;
  const mouth =
    mood === "cheer" || mood === "happy"
      ? "M34 52 Q44 60 54 52"
      : mood === "locked"
        ? "M36 54 L52 54"
        : mood === "future"
          ? "M38 54 Q44 50 50 54"
          : "M37 53 Q44 58 51 53";

  return (
    <svg
      width={88}
      height={72}
      viewBox="0 0 88 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="shrink-0"
    >
      <ellipse cx="44" cy="66" rx="22" ry="4" fill="rgb(107 218 10 / 0.12)" />
      <path
        d="M18 18C18 8 26 2 44 2C62 2 70 8 70 18C70 28 66 38 58 48C52 56 48 62 44 64C40 62 36 56 30 48C22 38 18 28 18 18Z"
        fill="#0a0a0a"
        stroke="rgb(107 218 10 / 0.45)"
        strokeWidth="1.5"
      />
      <path
        d="M24 14C28 6 36 4 44 6C52 4 60 6 64 14C62 22 54 28 44 30C34 28 26 22 24 14Z"
        fill="rgb(107 218 10 / 0.2)"
      />
      <circle cx="34" cy="38" r="5" fill="#f4f4f5" />
      <circle cx="54" cy="38" r="5" fill="#f4f4f5" />
      <circle
        cx={mood === "happy" || mood === "cheer" ? 35 : 34}
        cy={mood === "happy" || mood === "cheer" ? 37 : 38}
        r="2"
        fill="#010101"
        transform={`scale(${eyeScale})`}
        style={{ transformOrigin: "34px 38px" }}
      />
      <circle
        cx={mood === "happy" || mood === "cheer" ? 55 : 54}
        cy={mood === "happy" || mood === "cheer" ? 37 : 38}
        r="2"
        fill="#010101"
        transform={`scale(${eyeScale})`}
        style={{ transformOrigin: "54px 38px" }}
      />
      <path
        d={mouth}
        stroke="#6bda0a"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {mood === "locked" ? (
        <rect
          x="40"
          y="14"
          width="8"
          height="6"
          rx="1"
          fill="none"
          stroke="#6bda0a"
          strokeWidth="1.2"
        />
      ) : null}
    </svg>
  );
}

export function DayCompanion({ state, date }: DayCompanionProps) {
  const reduce = useReducedMotion();
  const mood = resolveMood(state, date);
  const message = companionMessage(state, date);

  return (
    <motion.div
      layout
      className="glass-panel relative overflow-hidden rounded-2xl p-4"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent-soft blur-2xl"
        aria-hidden
      />
      <div className="relative flex items-start gap-3">
        <motion.div
          animate={reduce ? undefined : { y: [0, -3, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <CompanionCharacter mood={mood} />
        </motion.div>
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
            Slate guide
          </p>
          <motion.p
            key={`${date}-${message}`}
            initial={reduce ? false : { opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.28 }}
            className="mt-1.5 text-sm leading-relaxed text-text-secondary"
          >
            {message}
          </motion.p>
        </div>
      </div>
    </motion.div>
  );
}