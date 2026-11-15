import type { SortingState } from "@tanstack/react-table";
import type { TransactionSortField } from "@mybookkeeper/api-client/types/transaction/TransactionSortField";
import {
  DEFAULT_TRANSACTION_SORT_DIRECTION,
  DEFAULT_TRANSACTION_SORT_FIELD,
} from "@mybookkeeper/api-client/constants/transactionSort";

/** Newest first, the server's own default. */
export const DEFAULT_TRANSACTION_SORTING: SortingState = [
  { id: DEFAULT_TRANSACTION_SORT_FIELD, desc: DEFAULT_TRANSACTION_SORT_DIRECTION === "desc" },
];

/** The table columns the server orders by; each column id is the sort field of the same name. */
export const SERVER_SORTABLE_TRANSACTION_COLUMNS: readonly TransactionSortField[] = [
  "status",
  "transaction_date",
  "vendor",
  "amount",
  "transaction_type",
  "category",
  "property_id",
  "tax_relevant",
];
