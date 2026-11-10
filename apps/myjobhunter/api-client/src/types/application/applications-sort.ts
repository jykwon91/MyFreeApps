import type { ApplicationSortField } from "./application-sort-field";
import type { SortOrder } from "./sort-order";

/** Which column the server sorts the applications list on, and which way. */
export interface ApplicationsSort {
  sort: ApplicationSortField;
  order: SortOrder;
}
