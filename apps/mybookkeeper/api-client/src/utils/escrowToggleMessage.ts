/** What marking a document reference-only did: it also removes the transactions that came from it. */
export function referenceOnlyMarkedMessage(transactionsRemoved: number): string {
  if (transactionsRemoved <= 0) return "Marked as reference-only";
  return `Marked as reference-only — removed ${transactionsRemoved} transaction${transactionsRemoved > 1 ? "s" : ""}`;
}
