export interface TransactionListParams {
  property_id?: string;
  unassigned?: boolean;
  applicant_id?: string;
  status?: string;
  transaction_type?: string;
  category?: string;
  vendor?: string;
  start_date?: string;
  end_date?: string;
  tax_year?: number;
  reconciled?: boolean;
}
