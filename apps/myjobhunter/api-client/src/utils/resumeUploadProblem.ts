import { RESUME_UPLOAD_MAX_BYTES, RESUME_UPLOAD_MIME_TYPES } from "../constants/resumeUploadLimits";
import type { DocumentUploadProblem } from "../types/document/document-upload-problem";
import type { UploadCandidate } from "../types/upload/upload-candidate";
import { uploadProblem } from "./uploadProblem";

/** What POST /resumes would refuse about a file, so it can be said before uploading. */
export function resumeUploadProblem(file: UploadCandidate): DocumentUploadProblem | null {
  return uploadProblem(file, { mimeTypes: RESUME_UPLOAD_MIME_TYPES, maxBytes: RESUME_UPLOAD_MAX_BYTES });
}
