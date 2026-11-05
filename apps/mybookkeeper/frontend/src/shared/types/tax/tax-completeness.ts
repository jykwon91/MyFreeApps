export interface FormCompleteness {
  form_name: string;
  instance_label: string | null;
  filled_fields: string[];
  missing_fields: string[];
  total_expected: number;
  total_filled: number;
  highlights: string[];
}

export interface TaxCompletenessResponse {
  tax_year: number;
  tax_return_id: string;
  needs_recompute: boolean;
  forms: FormCompleteness[];
  summary: string;
}
