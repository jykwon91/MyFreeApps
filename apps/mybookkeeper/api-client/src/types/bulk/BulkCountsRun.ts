/** A batched bulk run that answers with counts, summed across the batches that went through. */
export interface BulkCountsRun<K extends string> {
  counts: Record<K, number>;
  failedIds: string[];
  error: unknown;
}
