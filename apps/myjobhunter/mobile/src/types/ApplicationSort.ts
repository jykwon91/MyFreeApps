import type { ApplicationSortField } from "@myjobhunter/api-client/types/application/application-sort-field";
import type { SortOrder } from "@myjobhunter/api-client/types/application/sort-order";

/** One way the server can sort the list, as the sort sheet offers it. */
export interface ApplicationSort {
  field: ApplicationSortField;
  direction: SortOrder;
  /** As the sort button and sheet say it, such as "Company, A to Z". */
  label: string;
}
