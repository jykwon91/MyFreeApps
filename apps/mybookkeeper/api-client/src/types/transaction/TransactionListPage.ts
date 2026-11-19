import type { Transaction } from "./transaction";

/** One page of GET /transactions/page: its rows, how many match the filters across every page, and what they add up to. */
export interface TransactionListPage {
  items: Transaction[];
  total: number;
  has_more: boolean;
  /** Every matching row's amount summed by the server, across every page, as decimal text ("1234.50"). */
  amount_total: string;
}
