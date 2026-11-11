import type { CompanySort } from "@myjobhunter/api-client/types/company/company-sort";

/** One way the sort sheet offers to order the list. */
export interface CompanySortOption extends CompanySort {
  /** As the sort button and sheet say it, such as "Industry, A to Z". */
  label: string;
}
