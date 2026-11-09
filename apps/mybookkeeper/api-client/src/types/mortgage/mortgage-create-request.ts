import type { MortgageRateType } from "./mortgage-rate-type";

/**
 * Body of ``POST /mortgages``.
 *
 * ``rate_type`` is required and has no default: whether the rate can move is
 * the one thing the comparison cannot infer, so the form asks rather than
 * assuming the common case.
 */
export interface MortgageCreateRequest {
  property_id: string;
  rate_type: MortgageRateType;
  source_document_id?: string | null;
  lender?: string | null;
  account_number?: string | null;
  current_balance_cents?: number | null;
  statement_date?: string | null;
  original_principal_cents?: number | null;
  interest_rate?: string | null;
  fixed_until?: string | null;
  maturity_date?: string | null;
  term_months?: number | null;
  monthly_principal_cents?: number | null;
  monthly_interest_cents?: number | null;
  monthly_escrow_cents?: number | null;
  notes?: string | null;
}
