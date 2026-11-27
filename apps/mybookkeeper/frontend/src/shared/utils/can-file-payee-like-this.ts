import { TRANSFER_TRANSACTION_TYPE } from "@mybookkeeper/api-client/constants/transactionTypes";
import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";

/** A payee rule needs a payee, and never files transfers (money between your own accounts). */
export function canFilePayeeLikeThis(vendor: string | null, transactionType: TransactionType): boolean {
  return Boolean(vendor?.trim()) && transactionType !== TRANSFER_TRANSACTION_TYPE;
}
