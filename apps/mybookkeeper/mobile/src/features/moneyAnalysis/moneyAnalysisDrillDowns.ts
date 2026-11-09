import type { DrillDownFilter } from "@mybookkeeper/api-client/types/analytics/drill-down-filter";
import { clipDates } from "@mybookkeeper/api-client/utils/clipDates";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import { monthBounds, monthName } from "../../lib/localDate";
import type { AnalysisScope } from "../../types/AnalysisScope";
import { categoryLabel } from "../transactions/transactionDisplay";

type Kind = "revenue" | "expenses";

const KIND_LABEL: Record<Kind, string> = { revenue: MESSAGES.revenue, expenses: MESSAGES.expenses };

/** A month, cut to the dates being looked at, so a part-month figure opens only the rows it counted. */
function monthDates(month: string, scope: AnalysisScope): { startDate: string; endDate: string } {
  const { start_date, end_date } = monthBounds(month);
  return clipDates({ startDate: start_date, endDate: end_date }, scope);
}

/** Everything of one kind over the whole period, within the categories left on. */
export function kindDrillDown(kind: Kind, scope: AnalysisScope): DrillDownFilter {
  return { type: kind, label: KIND_LABEL[kind], ...scope };
}

export function categoryDrillDown(category: string, scope: AnalysisScope): DrillDownFilter {
  return { category, label: categoryLabel(category), startDate: scope.startDate, endDate: scope.endDate, propertyIds: scope.propertyIds };
}

export function propertyDrillDown(propertyId: string, name: string, scope: AnalysisScope): DrillDownFilter {
  return { propertyId, label: name, startDate: scope.startDate, endDate: scope.endDate };
}

/** One month, whole, or just its revenue, or one category of it. */
export function monthDrillDown(month: string, what: Kind | { category: string }, scope: AnalysisScope): DrillDownFilter {
  const name = monthName(month, "long");
  const part = typeof what === "string" ? { type: what, categories: scope.categories } : { category: what.category };
  const label = typeof what === "string" ? KIND_LABEL[what] : categoryLabel(what.category);
  return { ...part, label: MESSAGES.monthDrillLabel(label, name), ...monthDates(month, scope), propertyIds: scope.propertyIds };
}

/** One property's revenue or expenses in one month, cut to the dates being looked at. */
export function propertyMonthDrillDown(propertyId: string, propertyName: string, month: string, kind: Kind, scope: AnalysisScope): DrillDownFilter {
  return { propertyId, type: kind, label: MESSAGES.propertyMonthDrillLabel(propertyName, KIND_LABEL[kind], monthName(month, "long")), ...monthDates(month, scope) };
}
