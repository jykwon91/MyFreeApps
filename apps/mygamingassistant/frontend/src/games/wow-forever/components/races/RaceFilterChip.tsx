import clsx from "clsx";

interface RaceFilterChipProps {
  label: string;
  /** What the list would hold with this chip picked. */
  count: number;
  pressed: boolean;
  onClick: () => void;
  testId: string;
}

/** A toggle chip with its count ("Horde · 5"); 44 px tall. */
export default function RaceFilterChip({ label, count, pressed, onClick, testId }: RaceFilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={clsx(
        "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-sm",
        pressed ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted/40",
      )}
      data-testid={testId}
    >
      {label}
      <span className={clsx("tabular-nums", pressed ? "opacity-90" : "text-muted-foreground")} data-testid={`${testId}-count`}>
        {count}
      </span>
    </button>
  );
}
