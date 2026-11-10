import { MAX_BULK_DELETE_DOCUMENT_IDS } from "../constants/documentBulkDelete";
import type { BulkDeleteDocumentsResponse } from "../types/document/BulkDeleteDocumentsResponse";
import type { BulkDeleteRun } from "../types/document/BulkDeleteRun";
import { runInBatches } from "./runInBatches";

/** Combine the responses of several bulk-delete requests into one. */
export function mergeBulkDeleteResponses(responses: BulkDeleteDocumentsResponse[]): BulkDeleteDocumentsResponse {
  return {
    deleted: responses.flatMap((r) => r.deleted),
    skipped: responses.flatMap((r) => r.skipped),
  };
}

/**
 * Sends the ids in server-sized batches, in order, stopping at the first batch that errors (a failing
 * server would only fail the rest too). Nothing already deleted is lost: the result says exactly what went,
 * what was skipped and why, and which ids were not deleted because of the error.
 */
export async function runBulkDelete(
  ids: readonly string[],
  send: (ids: string[]) => Promise<BulkDeleteDocumentsResponse>,
): Promise<BulkDeleteRun> {
  const run = await runInBatches(ids, MAX_BULK_DELETE_DOCUMENT_IDS, send);
  return { ...mergeBulkDeleteResponses(run.responses), failedIds: run.failedIds, error: run.error };
}
