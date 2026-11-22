export const TRANSACTION_LIST_MESSAGES = {
  loading: "Loading your transactions",
  loadingMore: "Loading more transactions",
} as const;

/** "12 transactions": how many rows the filters match across every page, not just the ones loaded. */
export function transactionCountLabel(total: number): string {
  return total === 1 ? "1 transaction" : `${total} transactions`;
}
