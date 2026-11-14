import type { SortDirection } from "../types/sort/SortDirection";
import type { SortFieldOption } from "../types/sort/SortFieldOption";
import type { TransactionSortField } from "../types/transaction/TransactionSortField";

/** Newest first, as the server orders the list when it isn't told otherwise. */
export const DEFAULT_TRANSACTION_SORT_FIELD: TransactionSortField = "transaction_date";
export const DEFAULT_TRANSACTION_SORT_DIRECTION: SortDirection = "desc";

/** Named as the website's column headers name them. */
export const TRANSACTION_SORT_FIELDS: readonly SortFieldOption<TransactionSortField>[] = [
  { value: "transaction_date", label: "Date" },
  { value: "amount", label: "Amount" },
  { value: "vendor", label: "Vendor" },
  { value: "category", label: "Category" },
  { value: "status", label: "Status" },
  { value: "transaction_type", label: "Type" },
];
