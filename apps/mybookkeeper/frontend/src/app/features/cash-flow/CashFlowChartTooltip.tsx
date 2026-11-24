import type { TooltipContentProps } from "recharts";
import type { CashFlowChartRow } from "@mybookkeeper/api-client/types/cash-flow/cash-flow-chart-row";
import { formatMonthLong } from "@mybookkeeper/api-client/utils/monthText";
import { formatCurrency } from "@/shared/utils/currency";
import { CASH_FLOW_MESSAGES as MSG } from "@/shared/lib/cash-flow-messages";

/** The hovered month: in, out, and what was left. */
export default function CashFlowChartTooltip({ active, payload }: Partial<TooltipContentProps>) {
  const row = payload?.[0]?.payload as CashFlowChartRow | undefined;
  if (!active || row === undefined) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-md"
      style={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
    >
      <p className="font-medium mb-1">{formatMonthLong(row.month)}</p>
      <p>{MSG.moneyIn}: {formatCurrency(row.moneyIn)}</p>
      <p>{MSG.moneyOut}: {formatCurrency(row.moneyOut)}</p>
      <p className="font-semibold">{MSG.net}: {formatCurrency(row.net)}</p>
    </div>
  );
}
