import { SUGGESTION_SEVERITY_ORDER } from "../constants/taxAdvisor";
import type { AdvisorCtaState } from "../types/tax/AdvisorCtaState";
import type { SeverityGroup } from "../types/tax/SeverityGroup";
import type { TaxAdvisorSuggestionRead } from "../types/tax/TaxAdvisorSuggestionRead";
import { httpStatus } from "./httpStatus";

/** What the "get advice" prompt should say after the last try. */
export function advisorCtaState(generateError: unknown): AdvisorCtaState {
  const status = httpStatus(generateError);
  if (status === 429) return "rate-limited";
  if (status === 403) return "demo";
  return generateError ? "error" : "idle";
}

/** Everything not dismissed, grouped high to low, without empty groups. */
export function groupSuggestionsBySeverity(suggestions: readonly TaxAdvisorSuggestionRead[]): SeverityGroup[] {
  const shown = suggestions.filter((suggestion) => suggestion.status !== "dismissed");
  return SUGGESTION_SEVERITY_ORDER.map((severity) => ({
    severity,
    items: shown.filter((suggestion) => suggestion.severity === severity),
  })).filter((group) => group.items.length > 0);
}
