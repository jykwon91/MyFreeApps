export interface BulkCapitalImprovementResponse {
  updated: number;
  /** Ids that were left alone: income, deleted, unknown, or not in the organization. */
  skipped: number;
}
