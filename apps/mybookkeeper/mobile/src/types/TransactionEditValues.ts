import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";

export interface TransactionEditValues {
  vendor: string;
  amount: string;
  type: TransactionType;
  category: string;
  propertyId: string | null;
  description: string;
}
