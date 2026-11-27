export interface PersonalFinancesTileProps {
  label: string;
  value: string;
  testId: string;
  /** A line under the figure. */
  hint?: string;
  /** Shows the figure in red, for a net below zero. */
  negative?: boolean;
}

export default function PersonalFinancesTile({ label, value, testId, hint, negative = false }: PersonalFinancesTileProps) {
  return (
    <div className="bg-card border rounded-lg px-4 py-3" data-testid={testId}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tabular-nums mt-1 text-xl font-semibold ${negative ? "text-red-600 dark:text-red-400" : ""}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
