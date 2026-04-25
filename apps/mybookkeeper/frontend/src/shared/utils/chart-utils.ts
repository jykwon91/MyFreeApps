import { parse, format, startOfMonth, endOfMonth } from "date-fns";
import { formatTag } from "@/shared/utils/tag";
import { EXPENSE_CATEGORY_LIST } from "@/shared/lib/constants";
import type { MonthSummary } from "@/shared/types/summary/month-summary";
import type { MonthExpenseSummary } from "@/shared/types/summary/month-expense-summary";
import type { PropertyMonthlySummary } from "@/shared/types/summary/property-monthly-summary";
import type { DrillDownFilter } from "@/shared/types/dashboard/drill-down-filter";
import type { MergedRow } from "@/shared/types/dashboard/merged-row";

export interface PropertyBarKey {
  dataKey: string;
  name: string;
  propertyId: string;
  revenueColor: string;
  expenseColor: string;
}

// Distinct hues per property — each property gets a unique color pair
const PROPERTY_COLORS = [
  { revenue: "#22c55e", expense: "#ef4444" }, // green / red
  { revenue: "#3b82f6", expense: "#f97316" }, // blue / orange
  { revenue: "#a855f7", expense: "#ec4899" }, // purple / pink
  { revenue: "#14b8a6", expense: "#eab308" }, // teal / yellow
  { revenue: "#06b6d4", expense: "#f43f5e" }, // cyan / rose
  { revenue: "#84cc16", expense: "#d946ef" }, // lime / fuchsia
  { revenue: "#6366f1", expense: "#fb923c" }, // indigo / amber
  { revenue: "#0ea5e9", expense: "#e11d48" }, // sky / crimson
];

export function formatMonthLabel(month: string): string {
  return format(parse(month, "yyyy-MM", new Date()), "MMM yy");
}

export function mergeData(
  byMonth: MonthSummary[],
  byMonthExpense: MonthExpenseSummary[],
  byPropertyMonth?: PropertyMonthlySummary[],
): { chartData: MergedRow[]; propertyKeys: PropertyBarKey[] } {
  const expenseMap = new Map(byMonthExpense.map((row) => [row.month, row]));
  const allMonths = new Set([...byMonth.map((r) => r.month), ...byMonthExpense.map((r) => r.month)]);
  const sorted = [...allMonths].sort();

  // Build property keys for both revenue and expense bars
  const properties = byPropertyMonth ?? [];
  const propertyKeys: PropertyBarKey[] = properties.map((p, i) => ({
    dataKey: p.property_id,
    name: p.name,
    propertyId: p.property_id,
    revenueColor: PROPERTY_COLORS[i % PROPERTY_COLORS.length].revenue,
    expenseColor: PROPERTY_COLORS[i % PROPERTY_COLORS.length].expense,
  }));

  // Build per-property monthly lookup: month → property_id → {revenue, expenses}
  const propMonthMap = new Map<string, Map<string, { revenue: number; expenses: number }>>();
  for (const prop of properties) {
    for (const m of prop.months) {
      if (!propMonthMap.has(m.month)) propMonthMap.set(m.month, new Map());
      propMonthMap.get(m.month)!.set(prop.property_id, { revenue: m.revenue, expenses: m.expenses });
    }
  }

  const chartData = sorted.map((month) => {
    const base = byMonth.find((r) => r.month === month);
    const expense = expenseMap.get(month);
    const row: MergedRow = {
      displayMonth: formatMonthLabel(month),
      rawMonth: month,
      revenue: base?.revenue ?? 0,
      profit: base?.profit ?? 0,
    };
    // Add per-property revenue and expense columns
    const propData = propMonthMap.get(month);
    for (const pk of propertyKeys) {
      const pd = propData?.get(pk.propertyId);
      row[`rev_${pk.propertyId}`] = pd?.revenue ?? 0;
      row[`exp_${pk.propertyId}`] = pd?.expenses ?? 0;
    }
    for (const cat of EXPENSE_CATEGORY_LIST) {
      row[cat] = expense?.[cat] ?? 0;
    }
    return row;
  });

  return { chartData, propertyKeys };
}

export function buildFilter(
  dataKey: string,
  entry: MergedRow,
  propertyKeys?: PropertyBarKey[],
): DrillDownFilter {
  const date = parse(entry.rawMonth, "yyyy-MM", new Date());
  const startDate = format(startOfMonth(date), "yyyy-MM-dd");
  const endDate = format(endOfMonth(date), "yyyy-MM-dd");
  const monthLabel = format(date, "MMMM yyyy");

  if (dataKey.startsWith("rev_")) {
    const propertyId = dataKey.slice(4);
    const pk = propertyKeys?.find((k) => k.propertyId === propertyId);
    const name = pk?.name ?? propertyId;
    return {
      propertyId,
      type: "revenue",
      startDate,
      endDate,
      label: `${name} Revenue — ${monthLabel}`,
    };
  }

  if (dataKey.startsWith("exp_")) {
    const propertyId = dataKey.slice(4);
    const pk = propertyKeys?.find((k) => k.propertyId === propertyId);
    const name = pk?.name ?? propertyId;
    return {
      propertyId,
      type: "expenses",
      startDate,
      endDate,
      label: `${name} Expenses — ${monthLabel}`,
    };
  }

  return {
    category: dataKey === "revenue" ? undefined : dataKey,
    type: dataKey === "revenue" ? "revenue" : undefined,
    startDate,
    endDate,
    label: dataKey === "revenue"
      ? `Revenue — ${monthLabel}`
      : `${formatTag(dataKey)} — ${monthLabel}`,
  };
}
