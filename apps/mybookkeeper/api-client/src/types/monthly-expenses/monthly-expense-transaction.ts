/** One payment counted under a heading: when, to whom, from which account. */
export interface MonthlyExpenseTransaction {
  id: string;
  /** "YYYY-MM-DD". */
  date: string;
  payee: string;
  /** The bank's own wording, when it says more than the payee. */
  description: string | null;
  /** The account the money left; all null for a row with no account. */
  account_name: string | null;
  account_institution: string | null;
  account_mask: string | null;
  amount_cents: number;
}
