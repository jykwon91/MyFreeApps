import type { TransactionListParams } from "./TransactionListParams";

/** One page of GET /transactions/page: the list's filters and order, and which rows of the result. */
export interface TransactionPageParams extends Omit<TransactionListParams, "limit"> {
  limit: number;
  offset: number;
}
