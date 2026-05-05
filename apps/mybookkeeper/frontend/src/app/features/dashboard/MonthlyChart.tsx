import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { parse, format, startOfMonth, endOfMonth } from "date-fns";
import { formatCurrency } from "@/shared/utils/currency";
import type { MonthSummary } from "@/shared/types/summary/month-summary";

interface ChartRow extends MonthSummary {
  displayMonth: string;
}

function formatMonth(month: string): string {
  return format(parse(month, "yyyy-MM", new Date()), "MMM yy");
}

export interface MonthlyChartProps {
  data: MonthSummary[];
  height?: number;
  onBarClick?: (startDate: string, endDate: string, dataKey: string) => void;
}

export default function MonthlyChart({ data, height = 260, onBarClick }: MonthlyChartProps) {
  const chartData: ChartRow[] = data.map((row) => ({
    ...row,
    displayMonth: formatMonth(row.month),
  }));

  function handleClick(dataKey: string, index: number, e: React.MouseEvent) {
    if (!onBarClick) return;
    const entry = chartData[index];
    if (!entry) return;
    const date = parse(entry.month, "yyyy-MM", new Date());
    onBarClick(
      format(startOfMonth(date), "yyyy-MM-dd"),
      format(endOfMonth(date), "yyyy-MM-dd"),
      dataKey,
    );
    e.stopPropagation();
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} barCategoryGap="30%">
        <XAxis dataKey="displayMonth" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))", borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey="revenue"
          name="Revenue"
          fill="#22c55e"
          radius={[2, 2, 0, 0]}
          cursor={onBarClick ? "pointer" : undefined}
          onClick={(_d: Record<string, unknown>, i: number, e: React.MouseEvent) => handleClick("revenue", i, e)}
        />
        <Bar
          dataKey="expenses"
          name="Expenses"
          fill="#ef4444"
          radius={[2, 2, 0, 0]}
          cursor={onBarClick ? "pointer" : undefined}
          onClick={(_d: Record<string, unknown>, i: number, e: React.MouseEvent) => handleClick("expenses", i, e)}
        />
        <Line dataKey="profit" name="Net Profit" stroke="#6366f1" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
