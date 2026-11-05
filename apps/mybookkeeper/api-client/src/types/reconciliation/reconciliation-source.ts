import type { ReconciliationSourceStatus } from "./reconciliation-source-status";

export interface ReconciliationSource {
  id: string;
  organization_id: string;
  user_id: string;
  document_id: string | null;
  source_type: string;
  tax_year: number;
  issuer: string | null;
  reported_amount: string;
  matched_amount: string;
  discrepancy: string;
  status: ReconciliationSourceStatus;
  created_at: string;
  document_file_name: string | null;
  property_name: string | null;
}
