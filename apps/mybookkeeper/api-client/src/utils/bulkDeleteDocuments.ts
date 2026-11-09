import { MAX_BULK_DELETE_DOCUMENT_IDS } from "../constants/documentBulkDelete";
import type { BulkDeleteDocumentsResponse } from "../types/document/BulkDeleteDocumentsResponse";
import type { BulkDeleteRun } from "../types/document/BulkDeleteRun";

/** Split ids into requests the server will accept. */
export function chunkDocumentIds(ids: string[], size: number = MAX_BULK_DELETE_DOCUMENT_IDS): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

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
  const responses: BulkDeleteDocumentsResponse[] = [];
  const batches = chunkDocumentIds([...ids]);
  for (const [index, batch] of batches.entries()) {
    try {
      responses.push(await send(batch));
    } catch (error) {
      return { ...mergeBulkDeleteResponses(responses), failedIds: batches.slice(index).flat(), error };
    }
  }
  return { ...mergeBulkDeleteResponses(responses), failedIds: [], error: null };
}
