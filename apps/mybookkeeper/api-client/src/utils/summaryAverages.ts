import type { MonthSummary } from "../types/summary/MonthSummary";
import type { MonthlyAverage } from "../types/summary/MonthlyAverage";

/** Averages over the months that had any money move, or null when none did. */
export function monthlyAverage(byMonth: readonly MonthSummary[]): MonthlyAverage | null {
  const active = byMonth.filter((month) => month.revenue !== 0 || month.expenses !== 0);
  if (active.length === 0) return null;
  const average = (pick: (month: MonthSummary) => number) => active.reduce((sum, month) => sum + pick(month), 0) / active.length;
  return {
    months: active.length,
    revenue: average((month) => month.revenue),
    expenses: average((month) => month.expenses),
    profit: average((month) => month.profit),
  };
}
