import { MAX_BULK_TRANSACTION_IDS } from "../constants/transactionBulk";
import type { BulkCountsRun } from "../types/bulk/BulkCountsRun";
import { runInBatches } from "./runInBatches";

/**
 * Runs a bulk endpoint that answers with counts (e.g. `{ approved, skipped }`) over any number of ids,
 * in batches the server accepts, and adds the counts up. `keys` names the counts to add.
 */
export async function runBulkCounts<K extends string>(
  ids: readonly string[],
  keys: readonly K[],
  send: (ids: string[]) => Promise<Record<K, number>>,
  size: number = MAX_BULK_TRANSACTION_IDS,
): Promise<BulkCountsRun<K>> {
  const run = await runInBatches(ids, size, send);
  const counts = Object.fromEntries(
    keys.map((key) => [key, run.responses.reduce((sum, response) => sum + response[key], 0)]),
  ) as Record<K, number>;
  return { counts, failedIds: run.failedIds, error: run.error };
}
