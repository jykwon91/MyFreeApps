import type { DrillDownScope } from "@mybookkeeper/api-client/types/analytics/drill-down-scope";
import { clipDates } from "@mybookkeeper/api-client/utils/clipDates";
import { monthBounds } from "../../lib/localDate";
import type { AnalysisScope } from "../../types/AnalysisScope";

type Kind = "revenue" | "expenses";

/** A month, cut to the dates being looked at, so a part-month figure opens only the rows it counted. */
function monthDates(month: string, scope: AnalysisScope): { startDate: string; endDate: string } {
  const { start_date, end_date } = monthBounds(month);
  return clipDates({ startDate: start_date, endDate: end_date }, scope);
}

/** Everything of one kind over the whole period, within the categories left on. */
export function kindDrillDown(kind: Kind, scope: AnalysisScope): DrillDownScope {
  return { type: kind, ...scope };
}

export function categoryDrillDown(category: string, scope: AnalysisScope): DrillDownScope {
  return { category, startDate: scope.startDate, endDate: scope.endDate, propertyIds: scope.propertyIds };
}

export function propertyDrillDown(propertyId: string, scope: AnalysisScope): DrillDownScope {
  return { propertyId, startDate: scope.startDate, endDate: scope.endDate };
}

/** One month, whole, or just its revenue, or one category of it. */
export function monthDrillDown(month: string, what: Kind | { category: string }, scope: AnalysisScope): DrillDownScope {
  const part = typeof what === "string" ? { type: what, categories: scope.categories } : { category: what.category };
  return { ...part, ...monthDates(month, scope), propertyIds: scope.propertyIds };
}

/** One property's revenue or expenses in one month, cut to the dates being looked at. */
export function propertyMonthDrillDown(propertyId: string, month: string, kind: Kind, scope: AnalysisScope): DrillDownScope {
  return { propertyId, type: kind, ...monthDates(month, scope) };
}

/** Everything in one month, within the properties and categories left on, cut to the dates being looked at. */
export function wholeMonthDrillDown(month: string, scope: AnalysisScope): DrillDownScope {
  return { ...monthDates(month, scope), propertyIds: scope.propertyIds, categories: scope.categories };
}
