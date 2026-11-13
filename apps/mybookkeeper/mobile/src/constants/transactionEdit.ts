import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";

// What the website switches to when the type changes.
export const DEFAULT_CATEGORY: Record<TransactionType, string> = {
  income: "rental_revenue",
  expense: "maintenance",
};

export const NO_PROPERTY_OPTION = "none";

export const TRANSACTION_EDIT_SHEET = {
  category: "category",
  property: "property",
  savedVendor: "savedVendor",
  channel: "channel",
  paymentMethod: "paymentMethod",
} as const;

export const TRANSACTION_SAVE_ACTION = { approve: "approve", save: "save" } as const;
