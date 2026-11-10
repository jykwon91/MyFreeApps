import { DOCUMENT_UPLOAD_MAX_BYTES, DOCUMENT_UPLOAD_MIME_TYPES } from "../constants/documentUploadLimits";
import type { DocumentUploadProblem } from "../types/document/document-upload-problem";

/** What the server would refuse about a file, so it can be said before uploading. An unknown size is left to the server. */
export function documentUploadProblem({ mimeType, size }: { mimeType: string; size?: number | null }): DocumentUploadProblem | null {
  if (!DOCUMENT_UPLOAD_MIME_TYPES.includes(mimeType)) return "type";
  if (size === 0) return "empty";
  if (size != null && size > DOCUMENT_UPLOAD_MAX_BYTES) return "size";
  return null;
}
