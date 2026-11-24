export interface BudgetProgressBarProps {
  percent: number;
  isOver: boolean;
  label: string;
}

const FULL = 100;

/** How much of a budget is spent. Fills up to full; over budget turns it red. */
export default function BudgetProgressBar({ percent, isOver, label }: BudgetProgressBarProps) {
  const width = Math.min(Math.max(percent, 0), FULL);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={FULL}
      className="h-2 w-full rounded-full bg-muted overflow-hidden"
      data-testid="budget-progress"
      data-over={isOver}
    >
      <div
        className={`h-full rounded-full ${isOver ? "bg-destructive" : "bg-primary"}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
