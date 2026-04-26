import { formatCurrency } from "@/shared/utils/currency";
import Card from "@/shared/components/ui/Card";
import type { MonthSummary } from "@/shared/types/summary/month-summary";

interface Props {
  byMonth: MonthSummary[];
}

export default function MonthlyAverageCard({ byMonth }: Props) {
  const activeMonths = byMonth.filter(
    (m) => m.revenue !== 0 || m.expenses !== 0,
  );
  const count = activeMonths.length;

  if (count === 0) return null;

  const avgRevenue =
    activeMonths.reduce((sum, m) => sum + m.revenue, 0) / count;
  const avgExpenses =
    activeMonths.reduce((sum, m) => sum + m.expenses, 0) / count;
  const avgProfit =
    activeMonths.reduce((sum, m) => sum + m.profit, 0) / count;

  return (
    <Card>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-base font-medium">Monthly Average</h2>
        <p className="text-xs text-muted-foreground">
          across {count} {count === 1 ? "month" : "months"}
        </p>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <dt className="text-sm text-muted-foreground">Revenue</dt>
          <dd className="text-xl font-semibold mt-1 text-green-600">
            {formatCurrency(avgRevenue)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Expenses</dt>
          <dd className="text-xl font-semibold mt-1 text-red-500">
            {formatCurrency(avgExpenses)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Profit</dt>
          <dd
            className={`text-xl font-semibold mt-1 ${
              avgProfit >= 0 ? "text-green-600" : "text-red-500"
            }`}
          >
            {formatCurrency(avgProfit)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
