import { LOST_CREATE_CHECK_WHERE } from "@myjobhunter/api-client/constants/lostCreateCheckWhere";
import type { DocumentUploadProblem } from "@myjobhunter/api-client/types/document/document-upload-problem";
import { rateLimitedMessage } from "@myjobhunter/api-client/utils/rateLimitedMessage";
import { unsureSavedMessage } from "@myjobhunter/api-client/utils/unsureSavedMessage";
import { uploadRejection } from "@myjobhunter/api-client/utils/uploadRejection";
import { isNoResponse } from "@platform/core/utils/isNoResponse";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import { RESUME_MESSAGES as MESSAGES } from "../constants/resume";

const PROBLEM_MESSAGES: Record<DocumentUploadProblem, string> = {
  type: MESSAGES.badType,
  size: MESSAGES.tooLarge,
  empty: MESSAGES.emptyFile,
};

/**
 * What to say about a resume upload that didn't go through: a file the phone refused, the rate limit, or a file the server
 * refused, or else a plain retry. After a lost answer or a server failure with no reason the file may have been stored, and
 * sending it again would make a second upload, so it says to check the uploads first.
 */
export function resumeUploadFailure(problem: DocumentUploadProblem | null, error?: unknown): string {
  if (problem) return PROBLEM_MESSAGES[problem];
  const rateLimited = rateLimitedMessage(error, "resumeUpload");
  if (rateLimited) return rateLimited;
  if (writeOutcome(error) === "unknown") return unsureSavedMessage(LOST_CREATE_CHECK_WHERE.resumes, isNoResponse(error));
  const reason = uploadRejection(error);
  return reason ? PROBLEM_MESSAGES[reason] : MESSAGES.couldntUpload;
}
