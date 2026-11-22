import type { InquirySpamStatus } from "../types/inquiry/inquiry-spam-status";

/**
 * The triage label shown for an inquiry, e.g. "Flagged · 42". Only flagged
 * and clean inquiries show their score (rounded); a missing score shows the
 * bare status word.
 */
export function inquirySpamLabel(status: InquirySpamStatus, score: number | null): string {
  if (status === "manually_cleared") return "Cleared";
  if (status === "spam") return "Spam";
  if (status === "flagged") return score !== null ? `Flagged · ${Math.round(score)}` : "Flagged";
  if (status === "clean") return score !== null ? `Clean · ${Math.round(score)}` : "Clean";
  return "Unscored";
}
