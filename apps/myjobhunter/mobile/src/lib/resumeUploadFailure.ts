import type { DocumentUploadProblem } from "@myjobhunter/api-client/types/document/document-upload-problem";
import { rateLimitedMessage } from "@myjobhunter/api-client/utils/rateLimitedMessage";
import { uploadRejection } from "@myjobhunter/api-client/utils/uploadRejection";
import { RESUME_MESSAGES as MESSAGES } from "../constants/resume";

const PROBLEM_MESSAGES: Record<DocumentUploadProblem, string> = {
  type: MESSAGES.badType,
  size: MESSAGES.tooLarge,
  empty: MESSAGES.emptyFile,
};

/** What to say about a resume upload that didn't go through: the rate limit, a file the phone or the server refused, or else a plain retry. */
export function resumeUploadFailure(problem: DocumentUploadProblem | null, error?: unknown): string {
  const rateLimited = rateLimitedMessage(error, "resumeUpload");
  if (rateLimited) return rateLimited;
  const reason = problem ?? uploadRejection(error);
  return reason ? PROBLEM_MESSAGES[reason] : MESSAGES.couldntUpload;
}
