import type { BulkCountsRun } from "@mybookkeeper/api-client/types/bulk/BulkCountsRun";
import type { BulkOutcomeMessage } from "@mybookkeeper/api-client/types/bulk/BulkOutcomeMessage";

/** What differs between one bulk transaction action and another; the batching, toast and guard are shared. */
export interface BulkTransactionRunOptions<K extends string> {
  /** The counts the server answers with, e.g. `["deleted", "skipped"]`. */
  keys: readonly K[];
  send: (batch: string[]) => Promise<Record<K, number>>;
  /** The website's wording for a finished run, including a partial one. */
  outcome: (run: BulkCountsRun<K>) => BulkOutcomeMessage;
  /** The phone's wording when no batch got through at all. */
  failure: (error: unknown) => string;
}
