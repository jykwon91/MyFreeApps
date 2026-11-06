import type { SubmissionVerdict } from "@/games/wow-forever/types/featureRequests/submissionVerdict";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";
import type { TriageSubmissionContext } from "@/games/wow-forever/types/featureRequests/triage/triageSubmissionContext";

/**
 * One untriaged submission. The player's words are only under `untrusted_*`; `claude_reason` and
 * `nuance_note` were derived from them. All of it is rendered as plain text, never as markup.
 */
export interface TriageInboxItem {
  submission_id: string;
  verdict: SubmissionVerdict;
  untrusted_submission_text: string | null;
  untrusted_clarification_answer: string | null;
  context: TriageSubmissionContext;
  claude_reason: string | null;
  nuance_note: string | null;
  parent_submission_id: string | null;
  model_id: string | null;
  story: TriageStory | null;
  created_at: string;
}
