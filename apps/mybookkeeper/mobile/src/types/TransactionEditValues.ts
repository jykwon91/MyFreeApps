import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";

export interface TransactionEditValues {
  /** The transaction date, "YYYY-MM-DD". */
  date: string;
  /** As typed, so a half-typed year can be shown back. */
  taxYear: string;
  vendor: string;
  /** The saved vendor it's linked to, or null for none. */
  vendorId: string | null;
  amount: string;
  type: TransactionType;
  category: string;
  propertyId: string | null;
  description: string;
  /** "" for none. */
  channel: string;
  /** "" for none. */
  paymentMethod: string;
  taxRelevant: boolean;
}
