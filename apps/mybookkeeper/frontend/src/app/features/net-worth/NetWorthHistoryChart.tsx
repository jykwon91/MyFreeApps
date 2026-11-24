import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { NetWorthChartRow } from "@mybookkeeper/api-client/types/net-worth/net-worth-chart-row";
import { axisMoney } from "@mybookkeeper/api-client/utils/axisMoney";
import { NET_WORTH_CHART_HEIGHT } from "@/shared/lib/net-worth-chart";
import { NET_WORTH_MESSAGES as MSG } from "@/shared/lib/net-worth-messages";
import NetWorthChartTooltip from "./NetWorthChartTooltip";

export interface NetWorthHistoryChartProps {
  rows: NetWorthChartRow[];
}

/** Net worth per day as one filled line, so the trend reads at a glance on a phone. */
export default function NetWorthHistoryChart({ rows }: NetWorthHistoryChartProps) {
  return (
    <div role="img" aria-label={MSG.chartLabel} data-testid="net-worth-chart">
      <ResponsiveContainer width="100%" height={NET_WORTH_CHART_HEIGHT}>
        <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis tickFormatter={axisMoney} tick={{ fontSize: 11 }} width={56} domain={["auto", "auto"]} />
          <Tooltip content={<NetWorthChartTooltip />} />
          <Area
            type="monotone"
            dataKey="net"
            name={MSG.net}
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary))"
            fillOpacity={0.12}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
