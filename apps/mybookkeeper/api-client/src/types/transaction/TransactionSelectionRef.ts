import type { TransactionStatus } from "./TransactionStatus";

/** A row "select all" ticks: enough to act on it in bulk without loading the whole row. */
export interface TransactionSelectionRef {
  id: string;
  property_id: string | null;
  status: TransactionStatus;
}
