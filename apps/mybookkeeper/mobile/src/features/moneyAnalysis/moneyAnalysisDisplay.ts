import { EXPENSE_CATEGORY_SET, REVENUE_CATEGORY_SET } from "@mybookkeeper/api-client/constants/summaryCategorySets";
import type { MonthExpenseSummary } from "@mybookkeeper/api-client/types/summary/MonthExpenseSummary";
import type { MonthSummary } from "@mybookkeeper/api-client/types/summary/MonthSummary";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import type { CategoryGroup } from "../../types/CategoryGroup";
import type { CategoryTotal } from "../../types/CategoryTotal";

function ranked(entries: [string, number][]): CategoryTotal[] {
  return entries
    .filter(([, amount]) => amount !== 0)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/** Every category with money in it, income, expenses and anything else apart, each biggest first. */
export function categoryGroups(byCategory: Readonly<Record<string, number>>): CategoryGroup[] {
  const entries = Object.entries(byCategory);
  const groups: CategoryGroup[] = [
    { kind: "income", heading: MESSAGES.income, rows: ranked(entries.filter(([category]) => REVENUE_CATEGORY_SET.has(category))) },
    { kind: "expenses", heading: MESSAGES.expenses, rows: ranked(entries.filter(([category]) => EXPENSE_CATEGORY_SET.has(category))) },
    { kind: "other", heading: MESSAGES.other, rows: ranked(entries.filter(([category]) => !REVENUE_CATEGORY_SET.has(category) && !EXPENSE_CATEGORY_SET.has(category))) },
  ];
  return groups.filter((group) => group.rows.length > 0);
}

/** The expense categories with money in one month, biggest first. */
export function monthExpenseRows(row: MonthExpenseSummary | undefined): CategoryTotal[] {
  if (!row) return [];
  return ranked(Object.entries(row).filter((entry): entry is [string, number] => entry[0] !== "month" && typeof entry[1] === "number"));
}

/** Newest month first, as the person is most likely looking for the latest. */
export function monthsNewestFirst(byMonth: readonly MonthSummary[]): MonthSummary[] {
  return [...byMonth].sort((a, b) => b.month.localeCompare(a.month));
}

export function monthsOldestFirst(byMonth: readonly MonthSummary[]): MonthSummary[] {
  return [...byMonth].sort((a, b) => a.month.localeCompare(b.month));
}

export function isEmptySummary(summary: { revenue: number; expenses: number; by_month: readonly unknown[]; by_property: readonly unknown[]; by_category: Readonly<Record<string, number>> }): boolean {
  return summary.revenue === 0 && summary.expenses === 0 && summary.by_month.length === 0 && summary.by_property.length === 0 && Object.keys(summary.by_category).length === 0;
}
