import type { TransactionScope } from "../types/transaction/TransactionScope";

/** In the order a picker lists them; personal first because most bank accounts are. */
export const TRANSACTION_SCOPES: readonly TransactionScope[] = ["personal", "rental", "business"];

export const TRANSACTION_SCOPE_LABELS: Record<TransactionScope, string> = {
  personal: "Personal",
  rental: "Rental",
  business: "Business",
};
