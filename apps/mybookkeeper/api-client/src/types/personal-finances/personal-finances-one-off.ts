/** A large payment in that doesn't recur. It counts in the totals but not in a typical month. */
export interface PersonalFinancesOneOff {
  transaction_id: string;
  /** "YYYY-MM-DD". */
  date: string;
  payee: string;
  amount_cents: number;
}
