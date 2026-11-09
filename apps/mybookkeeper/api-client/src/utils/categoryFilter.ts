import { EXPENSE_CATEGORY_LIST, REVENUE_CATEGORIES } from "../constants/transactionCategories";
import type { CategoryPreset } from "../types/analytics/category-preset";
import type { MonthExpenseSummary } from "../types/summary/MonthExpenseSummary";
import type { MonthSummary } from "../types/summary/MonthSummary";
import type { SummaryResponse } from "../types/summary/summary";

const REVENUE: ReadonlySet<string> = new Set(REVENUE_CATEGORIES);
const EXPENSES: ReadonlySet<string> = new Set(EXPENSE_CATEGORY_LIST);

/** Security deposits count as neither, but they can still be shown or hidden. */
export const ALL_SUMMARY_CATEGORIES: ReadonlySet<string> = new Set([...REVENUE_CATEGORIES, "security_deposit", ...EXPENSE_CATEGORY_LIST]);

export function categoriesForPreset(preset: CategoryPreset): Set<string> {
  switch (preset) {
    case "all":
      return new Set(ALL_SUMMARY_CATEGORIES);
    case "income":
      return new Set(REVENUE);
    case "expenses":
      return new Set(EXPENSES);
  }
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item));
}

export function isCategoryFilterActive(selected: ReadonlySet<string>): boolean {
  return !sameSet(selected, ALL_SUMMARY_CATEGORIES);
}

/** The preset these categories are exactly, or "all" when they are a hand-picked mix. */
export function detectCategoryPreset(selected: ReadonlySet<string>): CategoryPreset {
  if (sameSet(selected, categoriesForPreset("income"))) return "income";
  if (sameSet(selected, categoriesForPreset("expenses"))) return "expenses";
  return "all";
}

/** Turning off the last category left would leave nothing to show, so that does nothing. */
export function toggleCategory(selected: ReadonlySet<string>, category: string): Set<string> {
  if (selected.size === 1 && selected.has(category)) return new Set(selected);
  const next = new Set(selected);
  if (next.has(category)) next.delete(category);
  else next.add(category);
  return next;
}

/** The summary as if only these categories existed. Property sections keep their totals. */
export function filterSummaryByCategories(summary: SummaryResponse, selected: ReadonlySet<string>): SummaryResponse {
  const includesRevenue = [...selected].some((category) => REVENUE.has(category));

  const byCategory: Record<string, number> = {};
  let revenue = 0;
  let expenses = 0;
  for (const [category, amount] of Object.entries(summary.by_category)) {
    if (!selected.has(category)) continue;
    byCategory[category] = amount;
    if (REVENUE.has(category)) revenue += amount;
    else if (EXPENSES.has(category)) expenses += amount;
  }

  const byMonthExpense: MonthExpenseSummary[] = summary.by_month_expense.map((row) => {
    const kept: Record<string, number | string> = { month: row.month };
    for (const [key, value] of Object.entries(row)) {
      if (key !== "month" && selected.has(key) && typeof value === "number") kept[key] = value;
    }
    return kept as unknown as MonthExpenseSummary;
  });

  const byMonth: MonthSummary[] = summary.by_month.map((row) => {
    const expenseRow = summary.by_month_expense.find((candidate) => candidate.month === row.month);
    let monthExpenses = 0;
    for (const [key, value] of Object.entries(expenseRow ?? {})) {
      if (key !== "month" && selected.has(key) && typeof value === "number") monthExpenses += value;
    }
    const monthRevenue = includesRevenue ? row.revenue : 0;
    return { month: row.month, revenue: monthRevenue, expenses: monthExpenses, profit: monthRevenue - monthExpenses };
  });

  return {
    revenue,
    expenses,
    profit: revenue - expenses,
    by_category: byCategory,
    by_month: byMonth,
    by_month_expense: byMonthExpense,
    by_property: summary.by_property,
    by_property_month: summary.by_property_month,
  };
}
