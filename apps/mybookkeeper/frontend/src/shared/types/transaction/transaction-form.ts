export interface TransactionForm {
  property_id: string;
  transaction_date: string;
  tax_year: number;
  vendor: string;
  description: string;
  amount: string;
  transaction_type: "income" | "expense";
  category: string;
  tags: string[];
  tax_relevant: boolean;
  schedule_e_line: string;
  is_capital_improvement: boolean;
  placed_in_service_date: string;
  channel: string;
  address: string;
  payment_method: string;
}
