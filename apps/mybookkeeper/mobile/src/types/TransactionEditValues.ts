import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";

export interface TransactionEditValues {
  /** The transaction date, "YYYY-MM-DD". */
  date: string;
  vendor: string;
  amount: string;
  type: TransactionType;
  category: string;
  propertyId: string | null;
  description: string;
}
