import type { TaxAdvisorCachedResponse } from "@mybookkeeper/api-client/types/tax/TaxAdvisorCachedResponse";
import { TAX_ADVISOR_MESSAGES as MESSAGES } from "../../constants/taxAdvisor";

/** The line under the advisor entry, or null while it isn't known (still loading, or the lookup failed). */
export function advisorGlance(cached: TaxAdvisorCachedResponse | undefined, hasNone: boolean, isAdmin: boolean): string | null {
  if (hasNone) return isAdmin ? MESSAGES.entryNone : MESSAGES.entryNoneViewer;
  if (!cached) return null;
  if (cached.suggestions.length === 0) return MESSAGES.entryEmpty;
  const active = cached.suggestions.filter((suggestion) => suggestion.status === "active").length;
  return active === 0 ? MESSAGES.entryAllDone : MESSAGES.entryCount(active);
}
