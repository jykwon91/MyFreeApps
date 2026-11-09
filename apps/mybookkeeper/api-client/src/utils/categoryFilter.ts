import { EXPENSE_CATEGORY_SET, REVENUE_CATEGORY_SET } from "../constants/summaryCategorySets";
import { EXPENSE_CATEGORY_LIST, REVENUE_CATEGORIES } from "../constants/transactionCategories";
import type { CategoryPreset } from "../types/analytics/category-preset";
import type { MonthExpenseSummary } from "../types/summary/MonthExpenseSummary";
import type { MonthRevenueSummary } from "../types/summary/MonthRevenueSummary";
import type { MonthSummary } from "../types/summary/MonthSummary";
import type { SummaryResponse } from "../types/summary/summary";

const REVENUE = REVENUE_CATEGORY_SET;
const EXPENSES = EXPENSE_CATEGORY_SET;

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

/** What the selected categories add up to in one month's row. */
function selectedTotal(row: MonthExpenseSummary | MonthRevenueSummary | undefined, selected: ReadonlySet<string>): number {
  let total = 0;
  for (const [key, value] of Object.entries(row ?? {})) {
    if (key !== "month" && selected.has(key) && typeof value === "number") total += value;
  }
  return total;
}

function keepExpenses(row: MonthExpenseSummary, selected: ReadonlySet<string>): MonthExpenseSummary {
  const kept: MonthExpenseSummary = { ...row };
  for (const category of EXPENSE_CATEGORY_LIST) {
    if (!selected.has(category)) delete kept[category];
  }
  return kept;
}

function keepRevenue(row: MonthRevenueSummary, selected: ReadonlySet<string>): MonthRevenueSummary {
  const kept: MonthRevenueSummary = { ...row };
  for (const category of REVENUE_CATEGORIES) {
    if (!selected.has(category)) delete kept[category];
  }
  return kept;
}

/** The summary as if only these categories existed. Property sections keep their totals. */
export function filterSummaryByCategories(summary: SummaryResponse, selected: ReadonlySet<string>): SummaryResponse {
  const byCategory: Record<string, number> = {};
  let revenue = 0;
  let expenses = 0;
  for (const [category, amount] of Object.entries(summary.by_category)) {
    if (!selected.has(category)) continue;
    byCategory[category] = amount;
    if (REVENUE.has(category)) revenue += amount;
    else if (EXPENSES.has(category)) expenses += amount;
  }

  const byMonth: MonthSummary[] = summary.by_month.map((row) => {
    const monthRevenue = selectedTotal(summary.by_month_revenue.find((candidate) => candidate.month === row.month), selected);
    const monthExpenses = selectedTotal(summary.by_month_expense.find((candidate) => candidate.month === row.month), selected);
    return { month: row.month, revenue: monthRevenue, expenses: monthExpenses, profit: monthRevenue - monthExpenses };
  });

  return {
    revenue,
    expenses,
    profit: revenue - expenses,
    by_category: byCategory,
    by_month: byMonth,
    by_month_expense: summary.by_month_expense.map((row) => keepExpenses(row, selected)),
    by_month_revenue: summary.by_month_revenue.map((row) => keepRevenue(row, selected)),
    by_property: summary.by_property,
    by_property_month: summary.by_property_month,
  };
}
