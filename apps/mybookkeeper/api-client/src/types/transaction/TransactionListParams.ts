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
  /** Only the categories the dashboard summary adds up as revenue, or as expenses. */
  summary_kind?: "revenue" | "expenses";
  /** Leave out rows of inactive properties, as the dashboard summary does. */
  active_properties_only?: boolean;
  limit?: number;
}
