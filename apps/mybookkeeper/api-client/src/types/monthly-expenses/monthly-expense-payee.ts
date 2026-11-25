/** Everything one payee got under a heading over the range. */
export interface MonthlyExpensePayee {
  payee: string;
  total_cents: number;
  transaction_count: number;
}
