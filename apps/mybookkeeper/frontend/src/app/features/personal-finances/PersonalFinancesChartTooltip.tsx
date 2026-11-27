import type { TooltipContentProps } from "recharts";
import type { PersonalFinancesChartRow } from "@mybookkeeper/api-client/types/personal-finances/personal-finances-chart-row";
import { formatMonthLong } from "@mybookkeeper/api-client/utils/monthText";
import { formatCurrency } from "@/shared/utils/currency";
import { PERSONAL_FINANCES_MESSAGES as MSG } from "@/shared/lib/personal-finances-messages";

/** The hovered month: income, expenses split into spending and mortgages & loans, and what was left. */
export default function PersonalFinancesChartTooltip({ active, payload }: Partial<TooltipContentProps>) {
  const row = payload?.[0]?.payload as PersonalFinancesChartRow | undefined;
  if (!active || row === undefined) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-md"
      style={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
    >
      <p className="font-medium mb-1">{formatMonthLong(row.month)}</p>
      <p>{MSG.income}: {formatCurrency(row.income)}</p>
      <p>{MSG.spending}: {formatCurrency(row.spending)}</p>
      <p>{MSG.mortgagesLoans}: {formatCurrency(row.mortgagesLoans)}</p>
      <p className="font-semibold">{MSG.net}: {formatCurrency(row.net)}</p>
    </div>
  );
}
