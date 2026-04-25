export interface TaxSuggestion {
  id: string;
  category: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  estimated_savings: number | null;
  action: string;
  irs_reference: string | null;
  confidence: "high" | "medium" | "low";
  affected_properties: string[] | null;
  affected_form: string | null;
}

export interface TaxAdvisorResponse {
  suggestions: TaxSuggestion[];
  disclaimer: string;
}

export interface TaxAdvisorSuggestionRead extends TaxSuggestion {
  db_id: string;
  status: "active" | "dismissed" | "resolved";
  status_changed_at: string | null;
  generation_id: string;
}

export interface TaxAdvisorCachedResponse {
  suggestions: TaxAdvisorSuggestionRead[];
  disclaimer: string;
  generated_at: string | null;
  model_version: string | null;
}
