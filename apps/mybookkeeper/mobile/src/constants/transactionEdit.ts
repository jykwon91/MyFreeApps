import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";

// What the website switches to when the type changes.
export const DEFAULT_CATEGORY: Record<TransactionType, string> = {
  income: "rental_revenue",
  expense: "maintenance",
};

export const NO_PROPERTY_OPTION = "none";
