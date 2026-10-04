import { percent } from "@/lib/format";

interface WeightBarProps {
  weight: number | null;
  target: number | null;
  /** The percentage at the right edge, shared by every row so bars compare. */
  scale: number;
}

/** Current weight as a bar, target as a tick. */
export function WeightBar({ weight, target, scale }: WeightBarProps) {
  if (weight === null || target === null || scale <= 0) {
    return <span className="block h-3 w-full" />;
  }
  const position = (value: number) => `${Math.min(Math.max(value / scale, 0), 1) * 100}%`;
  const label = `${percent(weight)} now, target ${percent(target)}`;
  return (
    <span role="img" aria-label={label} title={label} className="relative block h-3 w-full">
      <span className="absolute inset-x-0 top-[4px] h-[4px] rounded-full bg-rule" />
      <span
        className="absolute left-0 top-[3px] h-[6px] rounded-r-[4px] bg-bar"
        style={{ width: position(weight) }}
      />
      <span
        className="absolute top-0 h-3 w-[2px] -translate-x-1/2 bg-ink"
        style={{ left: position(target) }}
      />
    </span>
  );
}
