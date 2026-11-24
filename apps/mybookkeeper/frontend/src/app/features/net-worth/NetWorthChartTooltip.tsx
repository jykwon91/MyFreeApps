import type { TooltipContentProps } from "recharts";
import type { NetWorthChartRow } from "@mybookkeeper/api-client/types/net-worth/net-worth-chart-row";
import { formatAccountDate } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { formatCurrency } from "@/shared/utils/currency";
import { NET_WORTH_MESSAGES as MSG } from "@/shared/lib/net-worth-messages";

/** The hovered day: the net total, then both sides of it. */
export default function NetWorthChartTooltip({ active, payload }: Partial<TooltipContentProps>) {
  const row = payload?.[0]?.payload as NetWorthChartRow | undefined;
  if (!active || row === undefined) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-md"
      style={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
    >
      <p className="font-medium mb-1">{formatAccountDate(row.day)}</p>
      <p className="font-semibold">{MSG.net}: {formatCurrency(row.net)}</p>
      <p className="text-muted-foreground">{MSG.assets}: {formatCurrency(row.assets)}</p>
      <p className="text-muted-foreground">{MSG.liabilities}: {formatCurrency(row.liabilities)}</p>
    </div>
  );
}
