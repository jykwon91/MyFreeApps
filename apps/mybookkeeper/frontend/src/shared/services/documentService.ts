import { EXPORT_REQUEST_TIMEOUT_MS } from "@platform/core/constants/requestTimeouts";
import api from "@/shared/lib/api";

export interface DocumentBlob {
  url: string;
  contentType: string;
  size: number;
}

/**
 * Fetches the source document for a given document ID and returns a
 * temporary blob URL, content type, and size.
 * The caller is responsible for calling URL.revokeObjectURL() when done.
 */
export async function fetchDocumentBlob(documentId: string): Promise<DocumentBlob> {
  const response = await api.get(`/documents/${documentId}/download`, {
    responseType: "blob",
    timeout: EXPORT_REQUEST_TIMEOUT_MS,
  });
  const blob: Blob = response.data;
  return {
    url: URL.createObjectURL(blob),
    contentType: blob.type,
    size: blob.size,
  };
}
