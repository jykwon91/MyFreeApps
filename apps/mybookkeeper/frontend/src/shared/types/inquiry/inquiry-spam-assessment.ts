/**
 * Audit-trail entry for the operator's spam triage panel. Mirrors backend
 * ``InquirySpamAssessmentResponse``.
 */
export type InquirySpamAssessmentType =
  | "turnstile"
  | "honeypot"
  | "submit_timing"
  | "disposable_email"
  | "rate_limit"
  | "claude_score"
  | "manual_override";

export interface InquirySpamAssessment {
  id: string;
  inquiry_id: string;
  assessment_type: InquirySpamAssessmentType;
  passed: boolean | null;
  score: number | null;
  flags: string[] | null;
  details_json: Record<string, unknown> | null;
  created_at: string;
}
