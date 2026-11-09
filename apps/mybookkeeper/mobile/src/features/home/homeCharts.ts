import { EXPENSE_CATEGORY_LIST } from "@mybookkeeper/api-client/constants/transactionCategories";
import type { MonthSummary } from "@mybookkeeper/api-client/types/summary/MonthSummary";
import { HOME_CHART_MONTHS, HOME_TOP_CATEGORIES } from "../../constants/home";
import { addMonths } from "../../lib/localDate";
import type { CategoryTotal } from "../../types/CategoryTotal";

const EXPENSE_CATEGORIES: ReadonlySet<string> = new Set(EXPENSE_CATEGORY_LIST);

/**
 * The last few months of the period, ending with the latest one that has numbers.
 * The API only lists months with numbers, so a quiet month in between is put back
 * as zero rather than closing up the gap. Fewer than two months isn't a trend: none.
 */
export function chartMonths(byMonth: readonly MonthSummary[]): MonthSummary[] {
  if (byMonth.length < 2) return [];
  const sorted = [...byMonth].sort((a, b) => a.month.localeCompare(b.month));
  const first = sorted[0].month;
  const last = sorted[sorted.length - 1].month;
  const known = new Map(sorted.map((month) => [month.month, month]));
  const months: MonthSummary[] = [];
  for (let offset = HOME_CHART_MONTHS - 1; offset >= 0; offset -= 1) {
    const month = addMonths(last, -offset);
    if (month < first) continue;
    months.push(known.get(month) ?? { month, revenue: 0, expenses: 0, profit: 0 });
  }
  return months;
}

/** The biggest expense categories, largest first. Income and refunds that net below zero aren't spending. */
export function topExpenseCategories(byCategory: Readonly<Record<string, number>>): CategoryTotal[] {
  return Object.entries(byCategory)
    .filter(([category, amount]) => EXPENSE_CATEGORIES.has(category) && amount > 0)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, HOME_TOP_CATEGORIES);
}
