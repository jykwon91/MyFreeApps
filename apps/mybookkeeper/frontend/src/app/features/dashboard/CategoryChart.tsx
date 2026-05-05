import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatTag } from "@/shared/utils/tag";
import { TAG_COLORS } from "@/shared/lib/constants";
import CategoryChartTooltip from "@/app/features/dashboard/CategoryChartTooltip";

export interface CategoryChartProps {
  byCategory: Record<string, number>;
  onBarClick?: (category: string) => void;
}

export default function CategoryChart({ byCategory, onBarClick }: CategoryChartProps) {
  const chartData = Object.entries(byCategory)
    .filter(([, amount]) => amount !== 0)
    .map(([key, amount]) => ({
      name: formatTag(key),
      amount,
      key,
    }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  const chartHeight = Math.max(200, chartData.length * 36);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
        <XAxis type="number" tickFormatter={(amount) => `$${(amount / 1000).toFixed(0)}k`} />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
        <Tooltip content={CategoryChartTooltip} />
        <Bar
          dataKey="amount"
          barSize={20}
          cursor={onBarClick ? "pointer" : undefined}
          onClick={(data: { key: string }) => onBarClick?.(data.key)}
        >
          {chartData.map((entry) => (
            <Cell key={entry.key} fill={TAG_COLORS[entry.key] ?? "#94a3b8"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
