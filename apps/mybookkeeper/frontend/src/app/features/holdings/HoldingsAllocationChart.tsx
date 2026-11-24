import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SECURITY_TYPE_COLORS, SECURITY_TYPE_LABELS } from "@mybookkeeper/api-client/constants/securityTypes";
import type { HoldingAllocation } from "@mybookkeeper/api-client/types/investments/holding-allocation";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";
import { ALLOCATION_BAR_HEIGHT, ALLOCATION_CHART_PADDING } from "./holdings-chart";

export interface HoldingsAllocationChartProps {
  allocation: HoldingAllocation[];
  currency: string;
}

/** The split by type as horizontal bars, largest first, with the percent of the total beside each. */
export default function HoldingsAllocationChart({ allocation, currency }: HoldingsAllocationChartProps) {
  const rows = allocation.map((slice) => ({
    type: slice.security_type,
    label: SECURITY_TYPE_LABELS[slice.security_type],
    percent: slice.percent ?? 0,
    valueCents: slice.value_cents,
  }));
  const height = rows.length * ALLOCATION_BAR_HEIGHT + ALLOCATION_CHART_PADDING;

  return (
    <div className="space-y-3">
      <div role="img" aria-label={MSG.allocationLabel} data-testid="holdings-allocation-chart">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={96} />
            <Tooltip
              formatter={(value) => [`${Number(value).toFixed(1)}%`, MSG.allocationTitle]}
              cursor={{ fill: "hsl(var(--muted))" }}
            />
            <Bar dataKey="percent" radius={[0, 2, 2, 0]} isAnimationActive={false}>
              {rows.map((row) => (
                <Cell key={row.type} fill={SECURITY_TYPE_COLORS[row.type]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid gap-1 text-sm sm:grid-cols-2" data-testid="holdings-allocation-list">
        {rows.map((row) => (
          <li key={row.type} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: SECURITY_TYPE_COLORS[row.type] }} aria-hidden />
              <span className="truncate">{row.label}</span>
            </span>
            <span className="tabular-nums text-muted-foreground">
              {formatAccountBalance(row.valueCents, currency)} · {row.percent.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
