/**
 * Client-side inquiry quality heuristic per RENTALS_PLAN.md §9.2.
 *
 * Each signal contributes one point (max 4):
 *   1. ``desired_start_date`` set → +1
 *   2. ``desired_end_date`` set → +1
 *   3. ``inquirer_employer`` non-empty → +1
 *   4. last inbound message body length > 100 chars → +1
 *
 * Score → badge mapping (see ``InquiryQualityBadge``):
 *   - 0–1 → gray "sparse" badge (likely a low-effort first contact)
 *   - 2–3 → no badge (standard inquiry)
 *   - 4   → green "complete inquiry" badge (everything we need to triage)
 */

const BODY_LENGTH_THRESHOLD = 100;
const COMPLETE_SCORE = 4;
const SPARSE_SCORE_MAX = 1;

export type InquiryQualityTier = "sparse" | "standard" | "complete";

export interface InquiryQualitySignals {
  desired_start_date: string | null;
  desired_end_date: string | null;
  inquirer_employer: string | null;
  // For inbox cards we pass last_message_preview (truncated to 120 chars
  // server-side, so this max-out at 120). For the detail view we pass the
  // full last inbound message body (uncapped).
  last_message_body: string | null;
}

export function computeInquiryQualityScore(
  signals: InquiryQualitySignals,
): number {
  let score = 0;
  if (signals.desired_start_date) score++;
  if (signals.desired_end_date) score++;
  if (signals.inquirer_employer && signals.inquirer_employer.trim().length > 0) score++;
  if (
    signals.last_message_body
    && signals.last_message_body.trim().length > BODY_LENGTH_THRESHOLD
  ) {
    score++;
  }
  return score;
}

export function getQualityTier(score: number): InquiryQualityTier {
  if (score <= SPARSE_SCORE_MAX) return "sparse";
  if (score >= COMPLETE_SCORE) return "complete";
  return "standard";
}
