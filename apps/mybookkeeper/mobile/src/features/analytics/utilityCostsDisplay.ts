import type { UtilityTrendPoint } from "@mybookkeeper/api-client/types/analytics/utility-trend-point";
import { UTILITY_LABELS } from "../../constants/analytics";
import { dateFromIso, isoFromDate, shiftMonth } from "../../lib/localDate";
import type { UtilityCostMonth } from "../../types/UtilityCostMonth";
import type { UtilityCostRow } from "../../types/UtilityCostRow";
import type { UtilityCostsPreset } from "../../types/UtilityCostsPreset";
import type { UtilityCostsRange } from "../../types/UtilityCostsRange";

export function presetRange(preset: UtilityCostsPreset, now: Date): UtilityCostsRange {
  const year = now.getFullYear();
  if (preset === "lastYear") return { startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31` };
  if (preset === "thisYear") return { startDate: `${year}-01-01`, endDate: isoFromDate(now) };
  return { startDate: isoFromDate(new Date(year, now.getMonth() - 11, 1)), endDate: isoFromDate(now) };
}

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

/** Every month in the range, newest first. A month with no bills is still there, at $0. */
export function monthRows(trends: readonly UtilityTrendPoint[], range: UtilityCostsRange): UtilityCostMonth[] {
  const months: UtilityCostMonth[] = [];
  const firstMonth = `${range.startDate.slice(0, 7)}-01`;
  for (let month = `${range.endDate.slice(0, 7)}-01`; month >= firstMonth; month = shiftMonth(month, -1)) {
    const period = month.slice(0, 7);
    const utilities = utilityRows(trends.filter((point) => point.period === period));
    months.push({ period, cents: totalCents(utilities), utilities });
  }
  return months;
}

/** A bar's width, as a share of the biggest value. Anything above zero stays visible. */
export function barPercent(cents: number, largestCents: number): number {
  if (cents <= 0 || largestCents <= 0) return 0;
  return Math.max(2, (cents / largestCents) * 100);
}

export function isCurrentMonth(period: string, now: Date): boolean {
  return period === isoFromDate(now).slice(0, 7);
}

function monthDate(period: string): Date {
  return dateFromIso(`${period}-01`);
}

export function monthLabel(period: string): string {
  return monthDate(period).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function spokenMonth(period: string): string {
  return monthDate(period).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function rangeLabel(range: UtilityCostsRange): string {
  return `${monthLabel(range.startDate.slice(0, 7))} to ${monthLabel(range.endDate.slice(0, 7))}`;
}
