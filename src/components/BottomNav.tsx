import { ChartLineUp, GearSix, House, ListChecks } from "@phosphor-icons/react";
import clsx from "clsx";

export type TabKey = "today" | "stats" | "manage" | "settings";

interface BottomNavProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

const tabs: Array<{ key: TabKey; label: string; icon: typeof House }> = [
  { key: "today", label: "Today", icon: House },
  { key: "stats", label: "Stats", icon: ChartLineUp },
  { key: "manage", label: "Plan", icon: ListChecks },
  { key: "settings", label: "Settings", icon: GearSix },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-border border-t bg-surface-0 pb-[var(--safe-bottom,env(safe-area-inset-bottom,0px))]">
      <div className="mx-auto flex max-w-lg items-center justify-around px-1.5 py-1.5">
        {tabs.map(({ key, label, icon: Icon }) => {
          const selected = active === key;
          return (
            <button
              aria-current={selected ? "page" : undefined}
              className={clsx(
                "focus-ring flex min-w-[64px] flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] transition active:scale-[0.98]",
                selected
                  ? "text-accent"
                  : "text-text-muted hover:text-text-secondary"
              )}
              key={key}
              onClick={() => onChange(key)}
              type="button"
            >
              <Icon size={20} weight={selected ? "fill" : "regular"} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
