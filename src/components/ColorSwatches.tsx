import clsx from "clsx";

interface ColorSwatchesProps {
  colors: string[];
  value: string;
  onChange: (color: string) => void;
}

export function ColorSwatches({ colors, value, onChange }: ColorSwatchesProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => {
        const selected = value === color;
        return (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            aria-label={`Color ${color}`}
            aria-pressed={selected}
            className={clsx(
              "focus-ring h-7 w-7 rounded-full border-2 transition active:scale-95",
              selected ? "border-text-primary scale-110" : "border-transparent",
            )}
            style={{ backgroundColor: color }}
          />
        );
      })}
    </div>
  );
}