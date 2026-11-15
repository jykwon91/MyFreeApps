/**
 * The columns the server can order the transaction list by. Mirrors the backend's TransactionSortField.
 * "property_id" orders by the property's name; "tax_relevant" by whether the row counts towards the tax report.
 */
export type TransactionSortField =
  | "transaction_date"
  | "amount"
  | "vendor"
  | "category"
  | "status"
  | "transaction_type"
  | "property_id"
  | "tax_relevant";
