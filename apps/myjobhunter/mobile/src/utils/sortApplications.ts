import type { Application } from "@myjobhunter/api-client/types/application";
import { formatRemoteType } from "@myjobhunter/api-client/utils/formatRemoteType";
import { getEventTypeSortRank } from "@myjobhunter/api-client/utils/getEventTypeSortRank";
import type { ApplicationSort } from "../types/ApplicationSort";
import type { ApplicationSortField } from "../types/ApplicationSortField";

function rawSortValue(application: Application, field: ApplicationSortField): string | number | null {
  switch (field) {
    case "company":
      return application.company_name;
    case "role":
      return application.role_title;
    case "status":
      return application.latest_status === null ? null : getEventTypeSortRank(application.latest_status);
    case "location":
      return application.location;
    case "remote":
      return formatRemoteType(application.remote_type);
    case "applied":
      return application.applied_at === null ? null : Date.parse(application.applied_at);
    case "fit":
      // Compared as a number only; it's shown as the Decimal string it arrived as.
      return application.fit_score === null ? null : Number(application.fit_score);
  }
}

/** Null for a row that has nothing to sort on, including a blank or unreadable value. */
function sortValue(application: Application, field: ApplicationSortField): string | number | null {
  const value = rawSortValue(application, field);
  return value === "" || Number.isNaN(value) ? null : value;
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
}

/**
 * A sorted copy. Rows missing the value sort last either way, so flipping the
 * direction never buries the ones that have it. Ties keep the server's order.
 */
export function sortApplications(applications: readonly Application[], sort: Pick<ApplicationSort, "field" | "direction">): Application[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...applications].sort((left, right) => {
    const a = sortValue(left, sort.field);
    const b = sortValue(right, sort.field);
    if (a === null) return b === null ? 0 : 1;
    if (b === null) return -1;
    return sign * compareValues(a, b);
  });
}
