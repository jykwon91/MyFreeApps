import type { DrillDownScope } from "@mybookkeeper/api-client/types/analytics/drill-down-scope";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import { UNASSIGNED_PROPERTY_ID } from "@mybookkeeper/api-client/constants/unassignedProperty";
import { DRILL_DOWN_MESSAGES, MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import { monthName } from "../../lib/localDate";
import { categoryLabel } from "../transactions/transactionDisplay";

/** The month both dates fall in ("2026-03"), when the drill-down covers one month. */
function singleMonth(scope: DrillDownScope): string | null {
  const month = scope.startDate?.slice(0, 7);
  return month && month === scope.endDate?.slice(0, 7) ? month : null;
}

/** The property's name from the list the phone already holds; null when it is not there (yet). */
function propertyName(propertyId: string, properties: readonly Property[]): string | null {
  if (propertyId === UNASSIGNED_PROPERTY_ID) return MESSAGES.noProperty;
  return properties.find((property) => property.id === propertyId)?.name || null;
}

function subject(scope: DrillDownScope): string | null {
  if (scope.category) return categoryLabel(scope.category);
  if (scope.type) return scope.type === "revenue" ? MESSAGES.revenue : MESSAGES.expenses;
  return null;
}

/**
 * What a drill-down screen says over its list, worked out from the filter that picks the rows,
 * the same wording the website puts over the same figure. The address never supplies text to show.
 * A property that is not in the list (still loading, or not the user's) leaves the neutral title.
 */
export function drillDownHeading(scope: DrillDownScope, properties: readonly Property[]): string {
  const month = singleMonth(scope);
  const what = subject(scope);
  let heading = what;
  if (scope.propertyId) {
    const name = propertyName(scope.propertyId, properties);
    if (name === null) return DRILL_DOWN_MESSAGES.title;
    heading = what ? MESSAGES.propertyDrillLabel(name, what) : name;
  }
  if (!heading) return month ? monthName(month, "long") : MESSAGES.allTransactions;
  return month ? MESSAGES.monthDrillLabel(heading, monthName(month, "long")) : heading;
}
