import type { UtilityTrendPoint } from "@mybookkeeper/api-client/types/analytics/utility-trend-point";
import { UTILITY_LABELS } from "../../constants/analytics";
import { dateFromIso } from "../../lib/localDate";
import type { UtilityCostRow } from "../../types/UtilityCostRow";

export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function utilityLabel(subCategory: string): string {
  return UTILITY_LABELS[subCategory] ?? subCategory.charAt(0).toUpperCase() + subCategory.slice(1).replaceAll("_", " ");
}

/** One row per utility that has bills, biggest first, added up in cents so rows always match the total. */
export function utilityRows(trends: readonly UtilityTrendPoint[]): UtilityCostRow[] {
  const centsByUtility = new Map<string, number>();
  for (const point of trends) {
    centsByUtility.set(point.sub_category, (centsByUtility.get(point.sub_category) ?? 0) + toCents(point.total));
  }
  return [...centsByUtility.entries()]
    .map(([subCategory, cents]) => ({ subCategory, label: utilityLabel(subCategory), cents }))
    .sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label));
}

export function totalCents(rows: readonly { cents: number }[]): number {
  return rows.reduce((sum, row) => sum + row.cents, 0);
}

/** A bar's width, as a share of the biggest value. Anything above zero stays visible. */
export function barPercent(cents: number, largestCents: number): number {
  if (cents <= 0 || largestCents <= 0) return 0;
  return Math.max(2, (cents / largestCents) * 100);
}

function monthDate(period: string): Date {
  return dateFromIso(`${period}-01`);
}

/** A quarter's period name, such as "2026-Q2". Months are "2026-04". */
export const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/;

export function monthLabel(period: string): string {
  const quarter = QUARTER_PATTERN.exec(period);
  if (quarter) return `Q${quarter[2]} ${quarter[1]}`;
  return monthDate(period).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function spokenMonth(period: string): string {
  const quarter = QUARTER_PATTERN.exec(period);
  if (quarter) return `quarter ${quarter[2]} of ${quarter[1]}`;
  return monthDate(period).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
