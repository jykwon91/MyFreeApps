export interface TransactionFormValues {
  vendor: string;
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
