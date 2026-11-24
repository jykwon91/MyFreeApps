export interface Filters {
  property_id: string;
  account_id: string;
  status: string;
  transaction_type: string;
  category: string;
  vendor: string;
  start_date: string;
  end_date: string;
  /** "rental" | "business" | "personal" — empty string means all scopes. */
  transaction_scope: string;
}
