import type { DrillDownFilter } from "@mybookkeeper/api-client/types/analytics/drill-down-filter";
import { monthBounds, monthName } from "../../lib/localDate";
import type { AnalysisScope } from "../../types/AnalysisScope";
import { categoryLabel } from "../transactions/transactionDisplay";

type Kind = "revenue" | "expenses";

const KIND_LABEL: Record<Kind, string> = { revenue: "Revenue", expenses: "Expenses" };

/** Everything of one kind over the whole period. */
export function kindDrillDown(kind: Kind, scope: AnalysisScope): DrillDownFilter {
  return { type: kind, label: KIND_LABEL[kind], ...scope };
}

export function categoryDrillDown(category: string, scope: AnalysisScope): DrillDownFilter {
  return { category, label: categoryLabel(category), ...scope };
}

export function propertyDrillDown(propertyId: string, name: string, scope: AnalysisScope): DrillDownFilter {
  return { propertyId, label: name, startDate: scope.startDate, endDate: scope.endDate };
}

/** One month, whole, or just its revenue, or one category of it. */
export function monthDrillDown(month: string, what: Kind | { category: string }, scope: AnalysisScope): DrillDownFilter {
  const { start_date, end_date } = monthBounds(month);
  const name = monthName(month, "long");
  const part = typeof what === "string" ? { type: what } : { category: what.category };
  const label = typeof what === "string" ? KIND_LABEL[what] : categoryLabel(what.category);
  return { ...part, label: `${label} — ${name}`, startDate: start_date, endDate: end_date, propertyIds: scope.propertyIds };
}

export function propertyMonthDrillDown(propertyId: string, propertyName: string, month: string, kind: Kind): DrillDownFilter {
  const { start_date, end_date } = monthBounds(month);
  return { propertyId, type: kind, label: `${propertyName} ${KIND_LABEL[kind]} — ${monthName(month, "long")}`, startDate: start_date, endDate: end_date };
}
