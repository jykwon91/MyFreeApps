import type { DocumentUploadProblem } from "../types/document/document-upload-problem";
import type { UploadCandidate } from "../types/upload/upload-candidate";
import type { UploadLimits } from "../types/upload/upload-limits";

/** What an upload endpoint would refuse about a file, so it can be said before uploading. */
export function uploadProblem({ mimeType, size }: UploadCandidate, { mimeTypes, maxBytes }: UploadLimits): DocumentUploadProblem | null {
  if (!mimeTypes.includes(mimeType)) return "type";
  if (size === 0) return "empty";
  if (size != null && size > maxBytes) return "size";
  return null;
}
