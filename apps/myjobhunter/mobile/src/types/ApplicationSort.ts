import type { ApplicationSortField } from "./ApplicationSortField";
import type { SortDirection } from "./SortDirection";

export interface ApplicationSort {
  field: ApplicationSortField;
  direction: SortDirection;
  /** As the sort button and sheet say it, such as "Company, A to Z". */
  label: string;
}
