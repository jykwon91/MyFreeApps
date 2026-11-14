import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionListParams } from "@mybookkeeper/api-client/types/transaction/TransactionListParams";
import type { TransactionSortField } from "@mybookkeeper/api-client/types/transaction/TransactionSortField";

function sortValue(row: Transaction, field: TransactionSortField): string | number | null {
  return field === "amount" ? Number(row.amount) : row[field];
}

/**
 * Orders rows as the backend does when asked to: by the chosen column (a missing value last), then
 * newest first. Unasked, rows keep the order a test gave them.
 */
export function inListOrder(rows: readonly Transaction[], params: TransactionListParams | undefined): readonly Transaction[] {
  const field = params?.sort_by;
  if (!field) return rows;
  const direction = params.sort_dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = sortValue(a, field);
    const right = sortValue(b, field);
    if (left === right) return b.transaction_date.localeCompare(a.transaction_date);
    if (left === null) return 1;
    if (right === null) return -1;
    return direction * (left < right ? -1 : 1);
  });
}
