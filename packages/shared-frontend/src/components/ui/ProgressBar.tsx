import { cn } from "../../utils/cn";

export type ProgressTone = "warning" | "primary" | "success";

interface Props {
  /** Percentage 0–100. Values outside the range are clamped. */
  value: number;
  /** Human-readable description for assistive tech, e.g. "57% to break-even — $47 of $82 raised". */
  label: string;
  tone?: ProgressTone;
  className?: string;
}

const TONE_FILL: Record<ProgressTone, string> = {
  warning: "bg-yellow-400 dark:bg-yellow-500",
  primary: "bg-primary",
  success: "bg-green-500 dark:bg-green-400",
};

/** Accessible progress bar. Exposes role=progressbar + aria-value* so the fill is not invisible to screen readers. */
export default function ProgressBar({ value, label, tone = "primary", className }: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${clamped}%`}
      aria-label={label}
      className={cn("h-3 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", TONE_FILL[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
