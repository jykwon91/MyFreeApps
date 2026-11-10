export interface BulkApproveTransactionsResponse {
  approved: number;
  /** Ids that were not approved: unknown, not in the organization, no property, or not awaiting review. */
  skipped: number;
}
