import type { SortDirection } from "../sort/SortDirection";
import type { TransactionSortField } from "./TransactionSortField";

/** One key of a multi-column order, as the backend's repeated `sort` param reads it. */
export type TransactionSortKey = `${TransactionSortField}:${SortDirection}`;
