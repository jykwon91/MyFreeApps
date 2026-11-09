import type { SuggestionSeverity } from "./SuggestionSeverity";
import type { TaxAdvisorSuggestionRead } from "./TaxAdvisorSuggestionRead";

export interface SeverityGroup {
  severity: SuggestionSeverity;
  items: TaxAdvisorSuggestionRead[];
}
