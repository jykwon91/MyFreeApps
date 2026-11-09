import type { MortgageRefiOutlook } from "./mortgage-refi-outlook";

/** Response of ``GET /mortgage-market/rate-watch``. */
export interface MortgageRateWatch {
  outlooks: MortgageRefiOutlook[];
  survey_30_year_pct: string | null;
  survey_15_year_pct: string | null;
  survey_observed_on: string | null;
  checked_mortgage_count: number;
  feed_unavailable_reason: string | null;
}
