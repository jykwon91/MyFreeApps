export interface TransactionListParams {
  property_id?: string;
  unassigned?: boolean;
  applicant_id?: string;
  status?: string;
  /** Pending, needs review or unverified: the rows someone still has to look at. */
  to_review?: boolean;
  transaction_type?: string;
  category?: string;
  vendor?: string;
  start_date?: string;
  end_date?: string;
  tax_year?: number;
  limit?: number;
}
