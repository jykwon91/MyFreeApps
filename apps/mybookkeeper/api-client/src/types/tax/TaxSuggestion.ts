import type { SuggestionConfidence } from "./SuggestionConfidence";
import type { SuggestionSeverity } from "./SuggestionSeverity";

export interface TaxSuggestion {
  id: string;
  category: string;
  severity: SuggestionSeverity;
  title: string;
  description: string;
  estimated_savings: number | null;
  action: string;
  irs_reference: string | null;
  confidence: SuggestionConfidence;
  affected_properties: string[] | null;
  affected_form: string | null;
}
