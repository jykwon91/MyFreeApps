import type { Transaction } from "./transaction";

/** One page of GET /transactions/page: its rows, and how many match the filters across every page. */
export interface TransactionListPage {
  items: Transaction[];
  total: number;
  has_more: boolean;
}
