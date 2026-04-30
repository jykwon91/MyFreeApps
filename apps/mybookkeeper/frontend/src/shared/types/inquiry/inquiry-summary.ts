import type { InquirySource } from "./inquiry-source";
import type { InquirySpamStatus } from "./inquiry-spam-status";
import type { InquiryStage } from "./inquiry-stage";
import type { InquirySubmittedVia } from "./inquiry-submitted-via";

/**
 * Mirrors backend ``InquirySummary`` Pydantic schema — the inbox-card shape
 * returned by GET /inquiries.
 *
 * Excludes notes / full PII per RENTALS_PLAN.md §9.1 information hierarchy
 * (the inbox card surfaces only what's actionable for triage).
 */
export interface InquirySummary {
  id: string;
  source: InquirySource;
  listing_id: string | null;
  stage: InquiryStage;

  inquirer_name: string | null;
  inquirer_employer: string | null;

  desired_start_date: string | null;
  desired_end_date: string | null;

  gut_rating: number | null;
  received_at: string;

  // T0 — public-form spam triage
  spam_status: InquirySpamStatus;
  spam_score: number | null;
  submitted_via: InquirySubmittedVia;

  last_message_preview: string | null;
  last_message_at: string | null;
}
