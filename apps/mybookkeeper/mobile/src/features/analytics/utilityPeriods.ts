import type { UtilityTrendPoint } from "@mybookkeeper/api-client/types/analytics/utility-trend-point";
import { dateFromIso, isoFromDate, monthBounds, monthOf, shiftMonth } from "../../lib/localDate";
import type { UtilityCostMonth } from "../../types/UtilityCostMonth";
import type { UtilityCostsRange } from "../../types/UtilityCostsRange";
import type { UtilityGranularity } from "../../types/UtilityGranularity";
import { totalCents, utilityRows } from "./utilityCostsDisplay";

const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/;

function quarterOf(iso: string): string {
  const date = dateFromIso(iso);
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

function shiftQuarter(period: string, by: number): string {
  const match = QUARTER_PATTERN.exec(period);
  if (!match) return period;
  const index = Number(match[1]) * 4 + (Number(match[2]) - 1) + by;
  return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
}

/** The first and last day a period covers; a "YYYY-MM" month or a "YYYY-Qn" quarter. */
export function periodBounds(period: string): { startDate: string; endDate: string } {
  const match = QUARTER_PATTERN.exec(period);
  if (!match) {
    const { start_date, end_date } = monthBounds(period);
    return { startDate: start_date, endDate: end_date };
  }
  const firstMonth = (Number(match[2]) - 1) * 3;
  const year = Number(match[1]);
  return { startDate: isoFromDate(new Date(year, firstMonth, 1)), endDate: isoFromDate(new Date(year, firstMonth + 3, 0)) };
}

/** Whether the period holds the day the person is on, so its figure is still growing. */
export function isCurrentPeriod(period: string, now: Date): boolean {
  const { startDate, endDate } = periodBounds(period);
  const today = isoFromDate(now);
  return startDate <= today && today <= endDate;
}

/** The days to show: the chosen dates, or for all time from the first bill to today. */
export function spanOf(range: UtilityCostsRange | null, trends: readonly UtilityTrendPoint[], now: Date): UtilityCostsRange | null {
  if (range) return range;
  if (trends.length === 0) return null;
  const first = trends.map((point) => periodBounds(point.period).startDate).sort()[0];
  return { startDate: first, endDate: isoFromDate(now) };
}

/** Every period in the span, newest first. One with no bills is still there, at $0. */
export function periodRows(trends: readonly UtilityTrendPoint[], span: UtilityCostsRange, granularity: UtilityGranularity): UtilityCostMonth[] {
  const rows: UtilityCostMonth[] = [];
  const push = (period: string) => {
    const utilities = utilityRows(trends.filter((point) => point.period === period));
    rows.push({ period, cents: totalCents(utilities), utilities });
  };
  if (granularity === "quarterly") {
    const first = quarterOf(span.startDate);
    for (let period = quarterOf(span.endDate); period >= first; period = shiftQuarter(period, -1)) push(period);
  } else {
    const first = monthOf(dateFromIso(span.startDate));
    for (let month = monthOf(dateFromIso(span.endDate)); month >= first; month = shiftMonth(month, -1)) push(month.slice(0, 7));
  }
  return rows;
}
