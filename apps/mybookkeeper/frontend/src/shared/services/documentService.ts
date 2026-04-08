import api from "@/shared/lib/api";

export interface DocumentBlob {
  url: string;
  contentType: string;
}

/**
 * Fetches the source document for a given document ID and returns a
 * temporary blob URL and content type.
 * The caller is responsible for calling URL.revokeObjectURL() when done.
 */
export async function fetchDocumentBlob(documentId: string): Promise<DocumentBlob> {
  const response = await api.get(`/documents/${documentId}/download`, {
    responseType: "blob",
  });
  const blob: Blob = response.data;
  return {
    url: URL.createObjectURL(blob),
    contentType: blob.type,
  };
}
