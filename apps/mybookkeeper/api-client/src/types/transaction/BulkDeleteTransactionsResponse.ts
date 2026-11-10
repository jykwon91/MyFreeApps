export interface BulkDeleteTransactionsResponse {
  deleted: number;
  /** Ids that were not deleted: unknown, not in the organization, or already deleted. */
  skipped: number;
}
