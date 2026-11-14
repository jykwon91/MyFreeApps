import type { SortDirection } from "@mybookkeeper/api-client/types/sort/SortDirection";
import type { TaxRelevantChoice } from "@mybookkeeper/api-client/types/transaction/TaxRelevantChoice";
import type { TransactionSortField } from "@mybookkeeper/api-client/types/transaction/TransactionSortField";
import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";
import type { TransactionPeriod } from "./TransactionPeriod";
import type { TransactionView } from "./TransactionView";

export interface TransactionFilters {
  view: TransactionView;
  period: TransactionPeriod;
  /** One "YYYY-MM" month, which takes the place of the period while set. */
  month: string | null;
  /** The two days of a custom range, "YYYY-MM-DD", both set while the period is "custom". */
  startDate: string | null;
  endDate: string | null;
  type: TransactionType | null;
  /** A property's id, or UNASSIGNED_PROPERTY for rows with none. */
  propertyId: string | null;
  category: string | null;
  vendor: string;
  /** Only rows that count towards the money totals. */
  approvedOnly: boolean;
  /** Only rows in the tax report, or only rows left out of it. */
  taxRelevant: TaxRelevantChoice | null;
  /** How the "All" view is ordered; the review queue is always newest first. */
  sortBy: TransactionSortField;
  sortDir: SortDirection;
}
