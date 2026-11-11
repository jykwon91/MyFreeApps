import { DOCUMENT_UPLOAD_MAX_BYTES, DOCUMENT_UPLOAD_MIME_TYPES } from "../constants/documentUploadLimits";
import type { DocumentUploadProblem } from "../types/document/document-upload-problem";
import type { UploadCandidate } from "../types/upload/upload-candidate";
import { uploadProblem } from "./uploadProblem";

/** What POST /documents/upload would refuse about a file, so it can be said before uploading. */
export function documentUploadProblem(file: UploadCandidate): DocumentUploadProblem | null {
  return uploadProblem(file, { mimeTypes: DOCUMENT_UPLOAD_MIME_TYPES, maxBytes: DOCUMENT_UPLOAD_MAX_BYTES });
}
