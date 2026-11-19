import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { Transaction } from "./transaction";

/**
 * A drill-down's transactions a page at a time, as a screen needs it: `transactions` is every loaded row, in the
 * server's order, `total` how many match across every page, and `amountTotal` what all of them add up to.
 */
export interface DrillDownPagesState extends Omit<InfinitePagesResult<Transaction>, "items"> {
  transactions: Transaction[];
  amountTotal: number;
}
