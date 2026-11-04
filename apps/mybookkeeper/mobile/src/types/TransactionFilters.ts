import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";
import type { TransactionPeriod } from "./TransactionPeriod";
import type { TransactionView } from "./TransactionView";

export interface TransactionFilters {
  view: TransactionView;
  period: TransactionPeriod;
  type: TransactionType | null;
  /** A property's id, or UNASSIGNED_PROPERTY for rows with none. */
  propertyId: string | null;
  category: string | null;
  vendor: string;
  /** Only rows that count towards the money totals. */
  approvedOnly: boolean;
}
