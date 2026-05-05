import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { Payload as LegendPayload } from "recharts/types/component/DefaultLegendContent";
import { parse, format } from "date-fns";
import { UTILITY_SUB_CATEGORY_COLORS, UTILITY_SUB_CATEGORIES } from "@/shared/lib/constants";
import UtilityTrendsChartTooltip from "@/app/features/analytics/UtilityTrendsChartTooltip";
import type { UtilityTrendPoint } from "@/shared/types/analytics";

type Granularity = "monthly" | "quarterly";

type ChartRow = Record<string, string | number>;

function formatPeriodLabel(period: string, granularity: Granularity): string {
  if (granularity === "quarterly") {
    // period format: "2025-Q1"
    const [year, quarter] = period.split("-");
    return `${quarter} '${year.slice(2)}`;
  }
  // period format: "2025-01"
  try {
    return format(parse(period, "yyyy-MM", new Date()), "MMM ''yy");
  } catch {
    return period;
  }
}

function buildChartData(trends: UtilityTrendPoint[], granularity: Granularity): ChartRow[] {
  const periodMap = new Map<string, ChartRow>();

  for (const point of trends) {
    if (!periodMap.has(point.period)) {
      periodMap.set(point.period, {
        period: point.period,
        displayPeriod: formatPeriodLabel(point.period, granularity),
      });
    }
    const row = periodMap.get(point.period)!;
    const existing = (row[point.sub_category] as number | undefined) ?? 0;
    row[point.sub_category] = existing + point.total;
  }

  return Array.from(periodMap.values()).sort((a, b) =>
    String(a.period).localeCompare(String(b.period)),
  );
}

export interface UtilityTrendsChartProps {
  trends: UtilityTrendPoint[];
  granularity: Granularity;
  height?: number;
}

export default function UtilityTrendsChart({ trends, granularity, height = 350 }: UtilityTrendsChartProps) {
  const presentCategories = UTILITY_SUB_CATEGORIES.filter((cat) =>
    trends.some((t) => t.sub_category === cat),
  );
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());

  function handleLegendClick(data: LegendPayload) {
    const key = typeof data.dataKey === "string" ? data.dataKey : "";
    setHiddenLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const chartData = buildChartData(trends, granularity);
  const totalPeriods = chartData.length;
  const totalCategories = presentCategories.filter((c) => !hiddenLines.has(c)).length;

  return (
    <div
      aria-label={`Utility spend trends over ${totalPeriods} periods across ${totalCategories} utility types`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <XAxis
            dataKey="displayPeriod"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            content={<UtilityTrendsChartTooltip />}
          />
          <Legend
            onClick={handleLegendClick}
            wrapperStyle={{ fontSize: 12, cursor: "pointer" }}
            formatter={(value: string) => (
              <span
                style={{
                  color: hiddenLines.has(value)
                    ? "hsl(var(--muted-foreground))"
                    : "hsl(var(--foreground))",
                  textDecoration: hiddenLines.has(value) ? "line-through" : "none",
                  textTransform: "capitalize",
                }}
              >
                {value}
              </span>
            )}
          />
          {presentCategories.map((cat) => (
            <Line
              key={cat}
              type="monotone"
              dataKey={cat}
              name={cat}
              stroke={UTILITY_SUB_CATEGORY_COLORS[cat]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              hide={hiddenLines.has(cat)}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
