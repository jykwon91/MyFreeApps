import { MAX_BULK_DELETE_DOCUMENT_IDS } from "../constants/documentBulkDelete";
import type { BulkDeleteDocumentsResponse } from "../types/document/BulkDeleteDocumentsResponse";

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
