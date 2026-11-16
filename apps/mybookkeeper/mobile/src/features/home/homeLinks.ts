import type { HomePeriod } from "../../constants/home";
import { NO_FILTERS } from "../../constants/transactionFilters";
import type { AnalysisScope } from "../../types/AnalysisScope";
import { drillDownLink } from "../drillDown/drillDownLink";
import { categoryDrillDown, kindDrillDown, wholeMonthDrillDown } from "../moneyAnalysis/moneyAnalysisDrillDowns";
import { transactionsLink } from "../transactions/transactionFilters";

/*
 * Home opens the transactions list, which takes one property and one category. Once the
 * property or category filter narrows a number further than that, it opens the list of
 * transactions behind the number instead, which takes any set of either (the web Dashboard's
 * drill-down carries the same filters).
 */

function expensesFilters(period: HomePeriod) {
  return { ...NO_FILTERS, period, type: "expense" as const, approvedOnly: true };
}

/** A category's expenses within the chosen properties; the category filter doesn't narrow one category. */
export function categoryLink(category: string, period: HomePeriod, scope: AnalysisScope): string {
  if (scope.propertyIds) return drillDownLink(categoryDrillDown(category, scope));
  return transactionsLink({ ...expensesFilters(period), category });
}

export function allExpensesLink(period: HomePeriod, scope: AnalysisScope): string {
  if (scope.propertyIds || scope.categories) return drillDownLink(kindDrillDown("expenses", scope));
  return transactionsLink(expensesFilters(period));
}

export function monthLink(month: string, scope: AnalysisScope): string {
  if (scope.propertyIds || scope.categories) return drillDownLink(wholeMonthDrillDown(month, scope));
  return transactionsLink({ ...NO_FILTERS, month, approvedOnly: true });
}
