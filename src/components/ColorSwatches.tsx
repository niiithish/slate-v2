import clsx from "clsx";

interface ColorSwatchesProps {
  colors: string[];
  onChange: (color: string) => void;
  value: string;
}

export function ColorSwatches({ colors, value, onChange }: ColorSwatchesProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => {
        const selected = value === color;
        return (
          <button
            aria-label={`Color ${color}`}
            aria-pressed={selected}
            className={clsx(
              "focus-ring h-7 w-7 rounded-full border-2 transition active:scale-95",
              selected ? "scale-110 border-text-primary" : "border-transparent"
            )}
            key={color}
            onClick={() => onChange(color)}
            style={{ backgroundColor: color }}
            type="button"
          />
        );
      })}
    </div>
  );
}
