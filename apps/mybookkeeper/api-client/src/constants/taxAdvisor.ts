import type { AdvisorCtaState } from "../types/tax/AdvisorCtaState";
import type { SuggestionSeverity } from "../types/tax/SuggestionSeverity";

export const SUGGESTION_SEVERITY_ORDER: readonly SuggestionSeverity[] = ["high", "medium", "low"];

export const SUGGESTION_SEVERITY_LABELS: Record<SuggestionSeverity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** What the "get advice" prompt says after the last try. */
export const TAX_ADVISOR_CTA_MESSAGES: Record<AdvisorCtaState, string> = {
  "rate-limited": "I've already reviewed this return several times today. Check back tomorrow.",
  demo: "Tax advice isn't available in the demo workspace.",
  error: "I ran into a problem reviewing your tax data. Want me to try again?",
  idle: "I can review your tax return and suggest ways to save money or fix potential issues.",
};
