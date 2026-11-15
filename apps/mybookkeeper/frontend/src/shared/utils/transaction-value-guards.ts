import type { TransactionStatus } from "@mybookkeeper/api-client/types/transaction/TransactionStatus";
import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";
import { STATUS_OPTIONS, TYPE_OPTIONS } from "@/shared/lib/transaction-config";

export function isTransactionStatus(value: string): value is TransactionStatus {
  return STATUS_OPTIONS.some((status) => status === value);
}

export function isTransactionType(value: string): value is TransactionType {
  return TYPE_OPTIONS.some((type) => type === value);
}
