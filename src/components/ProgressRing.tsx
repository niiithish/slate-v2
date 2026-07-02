import { motion, useReducedMotion } from "motion/react";

interface ProgressRingProps {
  label?: string;
  size?: number;
  stroke?: number;
  value: number;
}

export function ProgressRing({
  value,
  size = 168,
  stroke = 10,
  label,
}: ProgressRingProps) {
  const reduce = useReducedMotion();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg aria-hidden className="-rotate-90" height={size} width={size}>
        <title>{label ? `${label} progress` : "Progress"}</title>
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="rgb(255 255 255 / 0.08)"
          strokeWidth={stroke}
        />
        <motion.circle
          animate={{ strokeDashoffset: offset }}
          cx={size / 2}
          cy={size / 2}
          fill="none"
          initial={reduce ? false : { strokeDashoffset: circumference }}
          r={radius}
          stroke="var(--color-accent)"
          strokeDasharray={circumference}
          strokeLinecap="round"
          strokeWidth={stroke}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-semibold text-3xl tracking-tight">
          {Math.round(clamped)}%
        </span>
        {label ? (
          <span className="mt-1 text-text-muted text-xs uppercase tracking-[0.18em]">
            {label}
          </span>
        ) : null}
      </div>
    </div>
  );
}
