/**
 * A loan as read off a statement — proposed, not asserted.
 *
 * ``rate_type`` is nullable here where the create request requires it: a
 * statement that never says whether the rate can move is a statement that
 * never says, and the form asking one question beats a reader inventing an
 * answer.
 */
export interface MortgageDraft {
  source_document_id: string;

  lender: string | null;
  account_number: string | null;

  current_balance_cents: number | null;
  statement_date: string | null;
  original_principal_cents: number | null;

  interest_rate: string | null;
  rate_type: string | null;
  fixed_until: string | null;

  maturity_date: string | null;
  term_months: number | null;

  monthly_principal_cents: number | null;
  monthly_interest_cents: number | null;
  monthly_escrow_cents: number | null;

  notes: string | null;

  confidence: string;
  warnings: string[];
  unrepresented: string[];
}
