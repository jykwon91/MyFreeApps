import type { DocumentUploadProblem } from "@myjobhunter/api-client/types/document/document-upload-problem";
import { uploadRejection } from "@myjobhunter/api-client/utils/uploadRejection";
import { APPLICATION_DOCUMENT_MESSAGES as MESSAGES } from "../constants/applicationDocuments";

const PROBLEM_MESSAGES: Record<DocumentUploadProblem, string> = {
  type: MESSAGES.badType,
  size: MESSAGES.tooLarge,
  empty: MESSAGES.emptyFile,
};

/** What to say about a file the upload can't take, whether the phone spotted it first or the server refused it. */
export function documentUploadFailure(problem: DocumentUploadProblem | null, error?: unknown): string {
  const reason = problem ?? uploadRejection(error);
  return reason ? PROBLEM_MESSAGES[reason] : MESSAGES.couldntUpload;
}
