import type { TransactionStatus } from "@mybookkeeper/api-client/types/transaction/TransactionStatus";
import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";
import { TRANSACTION_STATUS_OPTIONS } from "@mybookkeeper/api-client/constants/transactionStatusOptions";
import { TYPE_OPTIONS } from "@/shared/lib/transaction-config";

export function isTransactionStatus(value: string): value is TransactionStatus {
  return TRANSACTION_STATUS_OPTIONS.some((option) => option.value === value);
}

export function isTransactionType(value: string): value is TransactionType {
  return TYPE_OPTIONS.some((type) => type === value);
}
