import type { SubmissionContext } from "@/games/wow-forever/types/featureRequests/submissionContext";

/** `POST /api/wow/feature-requests` (the server forbids extra fields). */
export interface SubmitFeatureRequestBody {
  text: string;
  context?: SubmissionContext;
  client_id: string;
  /** Set on the answer to a clarifying question. */
  parent_submission_id?: string;
  clarification_answer?: string;
}
