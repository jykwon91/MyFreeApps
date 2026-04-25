import { useRef, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import { parse, format, startOfMonth, endOfMonth } from "date-fns";
import { formatTag } from "@/shared/utils/tag";
import {
  TAG_COLORS,
  EXPENSE_CATEGORY_LIST,
  REVENUE_TAGS,
} from "@/shared/lib/constants";
import MonthlyOverviewChartTooltip from "@/app/features/dashboard/MonthlyOverviewChartTooltip";
import type { MonthSummary } from "@/shared/types/summary/month-summary";
import type { MonthExpenseSummary } from "@/shared/types/summary/month-expense-summary";
import type { DrillDownFilter } from "@/shared/types/dashboard/drill-down-filter";
import type { DateRange } from "@/shared/types/dashboard/date-range";
import type { PropertyMonthlySummary } from "@/shared/types/summary/property-monthly-summary";
import { mergeData, buildFilter } from "@/shared/utils/chart-utils";

export default function MonthlyOverviewChart({
  byMonth,
  byMonthExpense,
  byPropertyMonth,
  onBarClick,
  onRangeSelect,
  selectedCategories,
}: {
  byMonth: MonthSummary[];
  byMonthExpense: MonthExpenseSummary[];
  byPropertyMonth?: PropertyMonthlySummary[];
  onBarClick: (filter: DrillDownFilter) => void;
  onRangeSelect: (range: DateRange) => void;
  selectedCategories?: Set<string>;
}) {
  const { chartData, propertyKeys } = mergeData(byMonth, byMonthExpense, byPropertyMonth);
  const hasPropertyBreakdown = propertyKeys.length > 0;
  const showPropertyExpenses = hasPropertyBreakdown && !selectedCategories;
  const displayToRaw = new Map(
    chartData.map((r) => [r.displayMonth, r.rawMonth]),
  );

  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const isDragging = useRef(false);

  const showRevenue =
    !selectedCategories ||
    [...REVENUE_TAGS].some((c) => selectedCategories.has(c));

  const activeCategories = EXPENSE_CATEGORY_LIST.filter((cat) => {
    if (selectedCategories && !selectedCategories.has(cat)) return false;
    return chartData.some((row) => (row[cat] as number) > 0);
  });

  function handleMouseDown(e: { activeLabel?: string }) {
    if (e.activeLabel) {
      isDragging.current = true;
      setDragStart(e.activeLabel);
      setDragEnd(e.activeLabel);
    }
  }

  function handleMouseMove(e: { activeLabel?: string }) {
    if (isDragging.current && e.activeLabel) {
      setDragEnd(e.activeLabel);
    }
  }

  function handleMouseUp() {
    if (isDragging.current && dragStart && dragEnd) {
      isDragging.current = false;

      const startRaw = displayToRaw.get(dragStart);
      const endRaw = displayToRaw.get(dragEnd);
      if (startRaw && endRaw) {
        const [first, last] =
          startRaw <= endRaw ? [startRaw, endRaw] : [endRaw, startRaw];

        if (first !== last) {
          const startDate = format(
            startOfMonth(parse(first, "yyyy-MM", new Date())),
            "yyyy-MM-dd",
          );
          const endDate = format(
            endOfMonth(parse(last, "yyyy-MM", new Date())),
            "yyyy-MM-dd",
          );
          onRangeSelect({ startDate, endDate });
        }
      }

      setDragStart(null);
      setDragEnd(null);
    }
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart
        data={chartData}
        barCategoryGap="20%"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (isDragging.current) {
            isDragging.current = false;
            setDragStart(null);
            setDragEnd(null);
          }
        }}
      >
        <XAxis dataKey="displayMonth" tick={{ fontSize: 11 }} />
        <YAxis
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 11 }}
        />
        <Tooltip
          content={MonthlyOverviewChartTooltip}
          wrapperStyle={{ pointerEvents: "none" }}
          position={{ y: -10 }}
          offset={20}
          allowEscapeViewBox={{ x: false, y: true }}
        />
        <Legend
          formatter={(value: string) =>
            value === "revenue"
              ? "Revenue"
              : value.includes(" — ")
                ? value
                : formatTag(value)
          }
          wrapperStyle={{ fontSize: 12 }}
        />
        {showRevenue && hasPropertyBreakdown
          ? propertyKeys.map((pk) => (
              <Bar
                key={`rev_${pk.propertyId}`}
                dataKey={`rev_${pk.propertyId}`}
                name={`${pk.name} — Revenue`}
                fill={pk.revenueColor}
                radius={[2, 2, 0, 0]}
                cursor="pointer"
                onClick={(
                  _data: Record<string, unknown>,
                  _index: number,
                  e: React.MouseEvent,
                ) => {
                  if (!isDragging.current) {
                    const entry = chartData[_index];
                    if (entry) onBarClick(buildFilter(`rev_${pk.propertyId}`, entry, propertyKeys));
                  }
                  e.stopPropagation();
                }}
              />
            ))
          : showRevenue && (
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill="#22c55e"
                radius={[2, 2, 0, 0]}
                cursor="pointer"
                onClick={(
                  _data: Record<string, unknown>,
                  _index: number,
                  e: React.MouseEvent,
                ) => {
                  if (!isDragging.current) {
                    const entry = chartData[_index];
                    if (entry) onBarClick(buildFilter("revenue", entry));
                  }
                  e.stopPropagation();
                }}
              />
            )}
        {showPropertyExpenses
          ? propertyKeys.map((pk) => (
              <Bar
                key={`exp_${pk.propertyId}`}
                dataKey={`exp_${pk.propertyId}`}
                name={`${pk.name} — Expenses`}
                fill={pk.expenseColor}
                radius={[2, 2, 0, 0]}
                cursor="pointer"
                onClick={(
                  _data: Record<string, unknown>,
                  _index: number,
                  e: React.MouseEvent,
                ) => {
                  if (!isDragging.current) {
                    const entry = chartData[_index];
                    if (entry) onBarClick(buildFilter(`exp_${pk.propertyId}`, entry, propertyKeys));
                  }
                  e.stopPropagation();
                }}
              />
            ))
          : activeCategories.map((cat) => (
              <Bar
                key={cat}
                dataKey={cat}
                name={cat}
                stackId="expenses"
                fill={TAG_COLORS[cat] ?? "#94a3b8"}
                cursor="pointer"
                onClick={(
                  _data: Record<string, unknown>,
                  _index: number,
                  e: React.MouseEvent,
                ) => {
                  if (!isDragging.current) {
                    const entry = chartData[_index];
                    if (entry) onBarClick(buildFilter(cat, entry));
                  }
                  e.stopPropagation();
                }}
              />
            ))}
        <Line
          dataKey="profit"
          name="Net Profit"
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
        />
        {dragStart && dragEnd && dragStart !== dragEnd ? (
          <ReferenceArea
            x1={dragStart}
            x2={dragEnd}
            fill="#6366f1"
            fillOpacity={0.15}
            stroke="#6366f1"
            strokeOpacity={0.3}
          />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
