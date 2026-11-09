import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";

export interface TransactionCreateValues {
  /** "YYYY-MM-DD" */
  date: string;
  type: TransactionType;
  amount: string;
  vendor: string;
  description: string;
  category: string;
  propertyId: string | null;
  /** Empty when there is none. */
  channel: string;
  /** Empty when there is none. */
  paymentMethod: string;
  taxRelevant: boolean;
}
