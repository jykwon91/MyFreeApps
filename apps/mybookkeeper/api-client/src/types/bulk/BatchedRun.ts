/** What sending ids in server-sized batches came to. */
export interface BatchedRun<R> {
  /** The response of every batch that went through, in order. */
  responses: R[];
  /** Ids in the batch that errored and in every batch after it, which were never sent. Safe to retry. */
  failedIds: string[];
  /** The error that stopped the run, or null when every batch went through. */
  error: unknown;
}
