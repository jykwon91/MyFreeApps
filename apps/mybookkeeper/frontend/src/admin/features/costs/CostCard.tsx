import { cn } from "@/shared/utils/cn";
import Card from "@/shared/components/ui/Card";
import { formatCost } from "@/admin/features/costs/format";

export default function CostCard({ label, cost, budget, detail }: {
  label: string;
  cost: number;
  budget?: number;
  detail?: string;
}) {
  const pct = budget && budget > 0 ? (cost / budget) * 100 : 0;
  const overBudget = budget !== undefined && budget > 0 && cost >= budget;
  const nearBudget = budget !== undefined && budget > 0 && pct >= 80 && !overBudget;

  return (
    <Card>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-semibold mt-1", overBudget && "text-red-500")}>
        {formatCost(cost)}
      </p>
      {budget !== undefined && budget > 0 && (
        <div className="mt-2">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{pct.toFixed(0)}% of budget</span>
            <span>{formatCost(budget)}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                overBudget ? "bg-red-500" : nearBudget ? "bg-amber-500" : "bg-primary",
              )}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>
      )}
      {detail && <p className="text-xs text-muted-foreground mt-2">{detail}</p>}
    </Card>
  );
}
