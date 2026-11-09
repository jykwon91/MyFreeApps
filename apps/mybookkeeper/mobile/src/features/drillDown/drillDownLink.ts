import type { DrillDownFilter } from "@mybookkeeper/api-client/types/analytics/drill-down-filter";
import type { DrillDownParams } from "../../types/DrillDownParams";

/** The screen that lists the approved transactions behind a number. */
export const DRILL_DOWN_PATH = "/analytics/drill-down";

export function drillDownLink(filter: DrillDownFilter): string {
  const params: DrillDownParams = {
    label: filter.label,
    category: filter.category ?? "",
    property: filter.propertyId ?? "",
    properties: filter.propertyIds?.join(",") ?? "",
    type: filter.type ?? "",
    from: filter.startDate ?? "",
    to: filter.endDate ?? "",
  };
  return `${DRILL_DOWN_PATH}?${new URLSearchParams(params).toString()}`;
}

export function drillDownFilterFromParams(params: Partial<DrillDownParams>): DrillDownFilter {
  return {
    label: params.label ?? "",
    category: params.category || undefined,
    propertyId: params.property || undefined,
    propertyIds: params.properties ? params.properties.split(",").filter(Boolean) : undefined,
    type: params.type === "revenue" || params.type === "expenses" ? params.type : undefined,
    startDate: params.from || undefined,
    endDate: params.to || undefined,
  };
}
