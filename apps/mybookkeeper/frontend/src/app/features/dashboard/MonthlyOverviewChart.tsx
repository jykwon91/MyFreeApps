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
import { formatTag } from "@/shared/utils/tag";
import {
  TAG_COLORS,
  EXPENSE_CATEGORY_LIST,
  REVENUE_TAGS,
} from "@/shared/lib/constants";
import MonthlyOverviewChartTooltip from "@/app/features/dashboard/MonthlyOverviewChartTooltip";
import type { MonthSummary } from "@mybookkeeper/api-client/types/summary/MonthSummary";
import type { MonthExpenseSummary } from "@mybookkeeper/api-client/types/summary/MonthExpenseSummary";
import type { DrillDownFilter } from "@mybookkeeper/api-client/types/analytics/drill-down-filter";
import type { DateRange } from "@/shared/types/dashboard/date-range";
import type { MergedRow } from "@/shared/types/dashboard/merged-row";
import type { PropertyMonthlySummary } from "@mybookkeeper/api-client/types/summary/PropertyMonthlySummary";
import { mergeData, buildFilter } from "@/shared/utils/chart-utils";
import { useChartColors } from "@/shared/hooks/useChartColors";
import { useMonthRangeDrag } from "@/shared/hooks/useMonthRangeDrag";
import { axisMoney } from "@mybookkeeper/api-client/utils/axisMoney";

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
  const colors = useChartColors();
  const { chartData, propertyKeys } = mergeData(byMonth, byMonthExpense, byPropertyMonth);
  const hasPropertyBreakdown = propertyKeys.length > 0;
  const showPropertyExpenses = hasPropertyBreakdown && !selectedCategories;
  const displayToRaw = new Map(
    chartData.map((r) => [r.displayMonth, r.rawMonth]),
  );

  const drag = useMonthRangeDrag((label) => displayToRaw.get(label), onRangeSelect);
  const dragOverlay = drag.overlay;

  const showRevenue =
    !selectedCategories ||
    [...REVENUE_TAGS].some((c) => selectedCategories.has(c));

  const activeCategories = EXPENSE_CATEGORY_LIST.filter((cat) => {
    if (selectedCategories && !selectedCategories.has(cat)) return false;
    return chartData.some((row) => (row[cat] as number) > 0);
  });

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart
        data={chartData}
        barCategoryGap="20%"
        {...drag.handlers}
      >
        <XAxis dataKey="displayMonth" tick={{ fontSize: 11 }} />
        <YAxis
          tickFormatter={axisMoney}
          tick={{ fontSize: 11 }}
        />
        <Tooltip
          content={<MonthlyOverviewChartTooltip />}
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
                onClick={(data, _index, e) => {
                  if (!drag.wasDragged()) {
                    const entry = data.payload as MergedRow | undefined;
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
                fill={colors.positive}
                radius={[2, 2, 0, 0]}
                cursor="pointer"
                onClick={(data, _index, e) => {
                  if (!drag.wasDragged()) {
                    const entry = data.payload as MergedRow | undefined;
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
                onClick={(data, _index, e) => {
                  if (!drag.wasDragged()) {
                    const entry = data.payload as MergedRow | undefined;
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
                onClick={(data, _index, e) => {
                  if (!drag.wasDragged()) {
                    const entry = data.payload as MergedRow | undefined;
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
        {dragOverlay && dragOverlay.start !== dragOverlay.end ? (
          <ReferenceArea
            x1={dragOverlay.start}
            x2={dragOverlay.end}
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
