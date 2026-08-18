/**
 * One electricity offer available at a property's ZIP, as ranked by the API.
 *
 * Nothing here is a local row — an offer becomes a `UtilityPlan` only if the
 * operator signs up and records it through the normal add flow.
 *
 * Mirrors `backend/app/schemas/properties/utility_offer.py`.
 */
export interface UtilityOffer {
  external_plan_id: number;
  provider_name: string;
  plan_name: string;
  term_months: number;
  /** Decimals arrive as strings so no precision is lost in JSON. */
  price_cents_per_kwh_at_500: string;
  price_cents_per_kwh_at_1000: string;
  price_cents_per_kwh_at_2000: string;
  renewable_pct: number | null;
  /** 1-5. `null` means unrated — never render that as zero stars. */
  provider_rating: number | null;
  jd_power_rating: number | null;
  /** `null` means no figure was published — distinct from a stated $0. */
  cancellation_fee_cents: number | null;
  cancellation_fee_is_per_remaining_month: boolean;
  is_teaser_priced: boolean;
  /**
   * Always `null` on a time-of-use offer — the reference usage says nothing
   * about when power is drawn, so there is no honest figure to put here.
   */
  annual_saving_cents: number | null;
  /**
   * The plan prices power differently by hour or day — free nights, free
   * weekends, off-peak discounts. The three disclosure prices are then a
   * blended average, not a rate that will be paid, so these are listed apart
   * from the ranked offers and never compared against a flat plan.
   */
  is_time_of_use: boolean;
  /**
   * The provider's own description of what the plan includes, verbatim and
   * truncated. Only populated for time-of-use offers, where it is the one place
   * the free window is stated in words.
   */
  special_terms: string | null;
  fact_sheet_url: string | null;
  enroll_url: string | null;
}
