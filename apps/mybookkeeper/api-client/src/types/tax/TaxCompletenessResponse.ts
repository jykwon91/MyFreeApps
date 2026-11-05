import type { FormCompleteness } from "./FormCompleteness";

export interface TaxCompletenessResponse {
  tax_year: number;
  tax_return_id: string;
  needs_recompute: boolean;
  forms: FormCompleteness[];
  summary: string;
}
