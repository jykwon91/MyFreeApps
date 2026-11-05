import type { MortgageRateType } from "./mortgage-rate-type";

/** A recorded loan, as ``GET /mortgages`` returns it. */
export interface Mortgage {
  id: string;
  user_id: string;
  organization_id: string;
  property_id: string;
  property_name: string | null;
  source_document_id: string | null;
  lender: string | null;
  account_number: string | null;
  current_balance_cents: number | null;
  statement_date: string | null;
  original_principal_cents: number | null;
  /** Percent, as a decimal string: ``"7.125"``. */
  interest_rate: string | null;
  rate_type: MortgageRateType;
  fixed_until: string | null;
  maturity_date: string | null;
  term_months: number | null;
  monthly_principal_cents: number | null;
  monthly_interest_cents: number | null;
  monthly_escrow_cents: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
