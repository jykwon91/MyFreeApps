import type { SortOrder } from "../application/sort-order";
import type { CompanySortField } from "./company-sort-field";

/** One way to order the Companies list. */
export interface CompanySort {
  field: CompanySortField;
  order: SortOrder;
}
