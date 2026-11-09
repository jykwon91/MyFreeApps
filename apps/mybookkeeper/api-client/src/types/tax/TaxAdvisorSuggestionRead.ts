import type { SuggestionStatus } from "./SuggestionStatus";
import type { TaxSuggestion } from "./TaxSuggestion";

export interface TaxAdvisorSuggestionRead extends TaxSuggestion {
  db_id: string;
  status: SuggestionStatus;
  status_changed_at: string | null;
  generation_id: string;
}
