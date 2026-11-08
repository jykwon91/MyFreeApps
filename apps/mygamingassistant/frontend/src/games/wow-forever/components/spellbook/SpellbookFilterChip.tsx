import clsx from "clsx";

interface SpellbookFilterChipProps {
  label: string;
  count: number;
  pressed: boolean;
  onClick: () => void;
  testId: string;
}

/** A toggle chip with the number of spells it would show. */
export default function SpellbookFilterChip({ label, count, pressed, onClick, testId }: SpellbookFilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 text-sm min-h-[44px]",
        pressed ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted/40",
      )}
      data-testid={testId}
    >
      {label}
      <span className={clsx("tabular-nums", !pressed && "text-muted-foreground")}>{count}</span>
    </button>
  );
}
