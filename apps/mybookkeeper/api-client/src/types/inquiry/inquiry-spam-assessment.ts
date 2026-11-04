import type { InquirySpamAssessmentType } from "./inquiry-spam-assessment-type";

/**
 * Audit-trail entry for the operator's spam triage panel. Mirrors backend
 * ``InquirySpamAssessmentResponse``.
 */
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
