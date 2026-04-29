export interface TransactionFormValues {
  vendor: string;
  // Host-curated link to the Vendors rolodex (PR 4.2). Empty string means
  // "(none)" — the form serialiser converts it to ``null`` on submit so
  // the backend can detach an existing link.
  vendor_id: string;
  description: string;
  amount: string;
  transaction_type: "income" | "expense";
  category: string;
  property_id: string;
  tax_relevant: boolean;
  payment_method: string;
  channel: string;
  transaction_date: string;
  tax_year: number;
}
