/**
 * Multipart payload for ``POST /signed-leases/{id}/attachments``.
 *
 * Web and phone build the file part differently, so the caller hands over the finished form:
 * ``file`` and ``kind``.
 */
export interface SignedLeaseAttachmentUploadRequest {
  leaseId: string;
  form: FormData;
}
