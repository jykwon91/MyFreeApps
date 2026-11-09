import type { UtilityOffer } from "@mybookkeeper/api-client/types/utility/utility-offer";
import type { UtilityOfferGroup } from "@mybookkeeper/api-client/types/utility/utility-offer-group";

export function aUtilityOffer(overrides: Partial<UtilityOffer> = {}): UtilityOffer {
  return {
    external_plan_id: 1,
    provider_name: "Octopus",
    plan_name: "Fixed 12",
    term_months: 12,
    price_cents_per_kwh_at_500: "11.5000",
    price_cents_per_kwh_at_1000: "10.5000",
    price_cents_per_kwh_at_2000: "10.9000",
    renewable_pct: 100,
    provider_rating: 4,
    jd_power_rating: null,
    cancellation_fee_cents: 15_000,
    cancellation_fee_is_per_remaining_month: false,
    is_teaser_priced: false,
    annual_saving_cents: 61_900,
    is_time_of_use: false,
    special_terms: null,
    fact_sheet_url: "https://example.test/efl.pdf",
    enroll_url: "https://example.test/enroll",
    ...overrides,
  };
}

export function aUtilityOfferGroup(overrides: Partial<UtilityOfferGroup> = {}): UtilityOfferGroup {
  return {
    property_id: "pr1",
    property_name: "Oak Street",
    zip_code: "78701",
    current_provider_name: "Reliant",
    current_price_cents_per_kwh_at_1000: "16.2800",
    switch_cost_cents: 15_000,
    offers: [aUtilityOffer()],
    withheld_low_rated_count: 0,
    time_of_use_offers: [],
    withheld_low_rated_time_of_use_count: 0,
    unavailable_reason: null,
    ...overrides,
  };
}
