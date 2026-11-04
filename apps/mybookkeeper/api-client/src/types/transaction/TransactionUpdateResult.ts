import type { Transaction } from "./transaction";

export interface TransactionUpdateResult extends Transaction {
  /** Other rows the server changed because of what this edit taught it. */
  retroactive_count?: number;
}
