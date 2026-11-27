export interface PersonalFinancesShareRowProps {
  label: string;
  amount: string;
  /** 0-100: how much of the whole this row is. */
  percent: number;
  testId: string;
}

/** A labelled amount with a bar showing its share of the whole. */
export default function PersonalFinancesShareRow({ label, amount, percent, testId }: PersonalFinancesShareRowProps) {
  return (
    <li className="space-y-1" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="tabular-nums font-medium">{amount}</span>
      </div>
      <div className="h-2 rounded-full bg-muted" aria-hidden="true">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </li>
  );
}
