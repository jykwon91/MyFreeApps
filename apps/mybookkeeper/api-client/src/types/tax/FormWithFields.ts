import type { TaxFormInstanceWithFields } from "./TaxFormInstanceWithFields";

export interface FormWithFields {
  form_name: string;
  instances: TaxFormInstanceWithFields[];
}
