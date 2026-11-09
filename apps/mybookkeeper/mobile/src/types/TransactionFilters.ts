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
}
