export interface FinancialAccountTotalTileProps {
  label: string;
  value: string;
  testId: string;
  emphasis?: boolean;
}

export default function FinancialAccountTotalTile({ label, value, testId, emphasis = false }: FinancialAccountTotalTileProps) {
  return (
    <div className="bg-card border rounded-lg px-4 py-3" data-testid={testId}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tabular-nums mt-1 ${emphasis ? "text-xl font-semibold" : "text-lg font-medium"}`}>{value}</p>
    </div>
  );
}
