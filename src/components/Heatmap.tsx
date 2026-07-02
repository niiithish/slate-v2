import type { HeatmapCell } from "../lib/types";

interface HeatmapProps {
  cells: HeatmapCell[];
}

function intensity(cell: HeatmapCell) {
  if (cell.total === 0) return 0;
  return cell.completion_rate / 100;
}

export function Heatmap({ cells }: HeatmapProps) {
  const weeks: HeatmapCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>12-week activity</span>
        <div className="flex items-center gap-2">
          <span>Less</span>
          <div className="flex gap-1">
            {[0.1, 0.3, 0.55, 0.8, 1].map((level) => (
              <span
                key={level}
                className="h-3 w-3 rounded-[4px]"
                style={{
                  background: `rgb(107 218 10 / ${0.15 + level * 0.65})`,
                }}
              />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-1.5">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-1.5">
              {week.map((cell) => {
                const alpha = 0.12 + intensity(cell) * 0.78;
                return (
                  <div
                    key={cell.date}
                    title={`${cell.date}: ${Math.round(cell.completion_rate)}% avoided`}
                    className="h-4 w-4 rounded-[4px] border border-border"
                    style={{
                      background:
                        cell.total === 0
                          ? "rgb(255 255 255 / 0.02)"
                          : `rgb(107 218 10 / ${alpha})`,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}