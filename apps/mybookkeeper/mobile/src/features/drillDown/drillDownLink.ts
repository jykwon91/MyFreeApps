import type { DrillDownScope } from "@mybookkeeper/api-client/types/analytics/drill-down-scope";
import type { DrillDownParams } from "../../types/DrillDownParams";

/** The screen that lists the approved transactions behind a number. */
export const DRILL_DOWN_PATH = "/analytics/drill-down";

export function drillDownLink(filter: DrillDownScope): string {
  const params: DrillDownParams = {
    category: filter.category ?? "",
    property: filter.propertyId ?? "",
    properties: filter.propertyIds?.join(",") ?? "",
    categories: filter.categories?.join(",") ?? "",
    type: filter.type ?? "",
    from: filter.startDate ?? "",
    to: filter.endDate ?? "",
  };
  return `${DRILL_DOWN_PATH}?${new URLSearchParams(params).toString()}`;
}

export function drillDownFilterFromParams(params: Partial<DrillDownParams>): DrillDownScope {
  return {
    category: params.category || undefined,
    propertyId: params.property || undefined,
    propertyIds: params.properties ? params.properties.split(",").filter(Boolean) : undefined,
    categories: params.categories ? params.categories.split(",").filter(Boolean) : undefined,
    type: params.type === "revenue" || params.type === "expenses" ? params.type : undefined,
    startDate: params.from || undefined,
    endDate: params.to || undefined,
  };
}
