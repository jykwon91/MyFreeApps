export interface BulkDeleteSummary {
  deleted: number;
  /** Asked for but not in the workspace any more. Information only: there is nothing to retry. */
  alreadyGone: number;
  /** Ids the server refused because they are being read. */
  beingReadIds: string[];
  /** Ids not deleted because a request failed (or was never sent after one did). Safe to retry. */
  failedIds: string[];
}
