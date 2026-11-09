import type { TaxAdvisorSuggestionRead } from "./TaxAdvisorSuggestionRead";

export interface TaxAdvisorCachedResponse {
  suggestions: TaxAdvisorSuggestionRead[];
  disclaimer: string;
  generated_at: string | null;
  model_version: string | null;
}
