import type { DocumentUploadProblem } from "@myjobhunter/api-client/types/document/document-upload-problem";
import { uploadRejection } from "@myjobhunter/api-client/utils/uploadRejection";
import { DOCUMENT_UPLOAD_PROBLEM_MESSAGES } from "@myjobhunter/api-client/constants/documentUploadProblemMessages";
import { DOCUMENT_MESSAGES as MESSAGES } from "../constants/documents";
import { createFailure } from "./writeFailure";

/**
 * What to say about a file the upload can't take, whether the phone spotted it first or the server refused it. An upload
 * makes a new document, so after a lost answer or a server failure with no reason it says to check before sending it again.
 * Null when a cache reset (sign-out, account change) called it off.
 */
export function documentUploadFailure(problem: DocumentUploadProblem | null, error?: unknown): string | null {
  if (problem) return DOCUMENT_UPLOAD_PROBLEM_MESSAGES[problem];
  const reason = uploadRejection(error);
  return createFailure(error, { failed: reason ? DOCUMENT_UPLOAD_PROBLEM_MESSAGES[reason] : MESSAGES.couldntUpload, checkWhere: MESSAGES.checkWhere });
}
