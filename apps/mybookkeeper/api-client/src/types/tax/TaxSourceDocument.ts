export interface TaxSourceDocument {
  document_id: string;
  file_name: string | null;
  document_type: string;
  issuer_name: string | null;
  issuer_ein: string | null;
  tax_year: number;
  key_amount: number | null;
  source: string;
  uploaded_at: string;
  form_instance_id: string;
}
