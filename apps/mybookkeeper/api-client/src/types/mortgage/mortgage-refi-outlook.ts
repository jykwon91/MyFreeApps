import type { MortgageRateType } from "./mortgage-rate-type";
import type { MortgageRefiVerdict } from "./mortgage-refi-verdict";

/**
 * What the rate check concluded about one loan.
 *
 * ``low``/``high`` always describe the FIGURE, never the rate it came from:
 * ``monthly_saving_low_cents`` is the smaller saving — the conservative case.
 * A ``null`` breakeven means the payment does not fall in that case at all,
 * which must never render as a long wait.
 */
export interface MortgageRefiOutlook {
  mortgage_id: string;
  property_id: string;
  property_name: string;
  lender: string | null;
  rate_type: MortgageRateType;

  current_rate_pct: string | null;
  current_balance_cents: number | null;

  is_checkable: boolean;
  unavailable_reason: string | null;
  verdict: MortgageRefiVerdict;

  survey_rate_pct: string | null;
  survey_term_months: number | null;
  survey_observed_on: string | null;

  comparable_rate_low_pct: string | null;
  comparable_rate_high_pct: string | null;

  remaining_term_months: number | null;

  current_payment_cents: number | null;
  new_payment_low_cents: number | null;
  new_payment_high_cents: number | null;

  monthly_saving_low_cents: number | null;
  monthly_saving_high_cents: number | null;

  closing_cost_low_cents: number | null;
  closing_cost_high_cents: number | null;

  breakeven_low_months: number | null;
  breakeven_high_months: number | null;
}
