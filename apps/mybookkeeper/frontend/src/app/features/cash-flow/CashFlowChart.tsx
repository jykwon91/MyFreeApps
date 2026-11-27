import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CashFlowChartRow } from "@mybookkeeper/api-client/types/cash-flow/cash-flow-chart-row";
import { axisMoney } from "@mybookkeeper/api-client/utils/axisMoney";
import { useChartColors } from "@/shared/hooks/useChartColors";
import { CASH_FLOW_CHART_HEIGHT } from "@/shared/lib/budget-pages";
import { CASH_FLOW_MESSAGES as MSG } from "@/shared/lib/cash-flow-messages";
import CashFlowChartTooltip from "./CashFlowChartTooltip";

export interface CashFlowChartProps {
  rows: CashFlowChartRow[];
}

// Spending and mortgages & loans stack into one money-out bar.
const MONEY_OUT_STACK = "moneyOut";

/** In and out as side-by-side bars per month, money out split into spending
 * and mortgages & loans, with the net as a line across them. */
export default function CashFlowChart({ rows }: CashFlowChartProps) {
  const colors = useChartColors();
  return (
    <div role="img" aria-label={MSG.chartLabel} data-testid="cash-flow-chart">
      <ResponsiveContainer width="100%" height={CASH_FLOW_CHART_HEIGHT}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={8} />
          <YAxis tickFormatter={axisMoney} tick={{ fontSize: 11 }} width={56} />
          <Tooltip content={<CashFlowChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="moneyIn" name={MSG.moneyIn} fill={colors.positive} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="spending" name={MSG.spending} stackId={MONEY_OUT_STACK} fill={colors.negative} isAnimationActive={false} />
          <Bar
            dataKey="mortgagesLoans"
            name={MSG.mortgagesLoans}
            stackId={MONEY_OUT_STACK}
            fill={colors.loans}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="net"
            name={MSG.net}
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
