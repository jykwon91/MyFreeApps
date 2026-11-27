import type { TransactionStatus } from "./TransactionStatus";

/** A row "select all" ticks: enough to act on it in bulk without loading the whole row. */
export interface TransactionSelectionRef {
  id: string;
  property_id: string | null;
  /** Split across properties: assigned, though `property_id` is null. */
  is_split: boolean;
  status: TransactionStatus;
}
