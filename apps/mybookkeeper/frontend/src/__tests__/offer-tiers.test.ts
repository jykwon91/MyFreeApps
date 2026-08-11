/**
 * Unit tests for collapsing offers into distinct decisions.
 *
 * The live Power to Choose feed routinely returns five or six retailers selling
 * the identical rate, term and rating. Listing them as separate candidates
 * presents five decisions where there is one, and buries the single stat that
 * actually separates them — what it costs to leave.
 */
import { describe, it, expect } from "vitest";
import { buildOfferTiers } from "@/shared/lib/offer-tiers";
import type { UtilityOffer } from "@/shared/types/utility/utility-offer";

function offer(overrides: Partial<UtilityOffer> = {}): UtilityOffer {
  return {
    external_plan_id: 1,
    provider_name: "Energy Texas",
    plan_name: "No Bull 12",
    term_months: 12,
    price_cents_per_kwh_at_500: "11.0",
    price_cents_per_kwh_at_1000: "10.50",
    price_cents_per_kwh_at_2000: "10.3",
    renewable_pct: null,
    provider_rating: 3,
    jd_power_rating: null,
    cancellation_fee_cents: 15000,
    cancellation_fee_is_per_remaining_month: false,
    is_teaser_priced: false,
    annual_saving_cents: 61920,
    fact_sheet_url: null,
    enroll_url: null,
    ...overrides,
  };
}

describe("buildOfferTiers", () => {
  it("collapses same rate, term and rating into one tier", () => {
    const tiers = buildOfferTiers([
      offer({ external_plan_id: 1 }),
      offer({ external_plan_id: 2, provider_name: "Express Energy" }),
      offer({ external_plan_id: 3, provider_name: "Octopus Energy" }),
    ]);

    expect(tiers).toHaveLength(1);
    expect(tiers[0].alternates).toHaveLength(2);
  });

  it("leads with the cheapest to leave", () => {
    const tiers = buildOfferTiers([
      offer({ external_plan_id: 1, cancellation_fee_cents: 15000 }),
      offer({ external_plan_id: 2, cancellation_fee_cents: 2000 }),
    ]);

    expect(tiers[0].lead.external_plan_id).toBe(2);
  });

  it("prices a per-remaining-month fee over the whole term before ranking it", () => {
    // $20/month across a 12-month term is $240 — worse than a flat $150, even
    // though its face value is the smaller number.
    const tiers = buildOfferTiers([
      offer({
        external_plan_id: 1,
        cancellation_fee_cents: 2000,
        cancellation_fee_is_per_remaining_month: true,
      }),
      offer({ external_plan_id: 2, cancellation_fee_cents: 15000 }),
    ]);

    expect(tiers[0].lead.external_plan_id).toBe(2);
  });

  it("sorts an unpublished fee last — it is not good news", () => {
    const tiers = buildOfferTiers([
      offer({ external_plan_id: 1, cancellation_fee_cents: null }),
      offer({ external_plan_id: 2, cancellation_fee_cents: 30000 }),
    ]);

    expect(tiers[0].lead.external_plan_id).toBe(2);
  });

  it("keeps genuinely different decisions apart", () => {
    const tiers = buildOfferTiers([
      offer({ external_plan_id: 1 }),
      offer({ external_plan_id: 2, term_months: 24 }),
      offer({ external_plan_id: 3, provider_rating: 5 }),
      offer({ external_plan_id: 4, price_cents_per_kwh_at_1000: "11.20" }),
      offer({ external_plan_id: 5, is_teaser_priced: true }),
    ]);

    expect(tiers).toHaveLength(5);
  });

  it("preserves the API's ranking across tiers", () => {
    const tiers = buildOfferTiers([
      offer({ external_plan_id: 1, price_cents_per_kwh_at_1000: "10.50" }),
      offer({ external_plan_id: 2, price_cents_per_kwh_at_1000: "11.20" }),
      offer({ external_plan_id: 3, price_cents_per_kwh_at_1000: "10.50" }),
    ]);

    expect(tiers.map((tier) => tier.lead.price_cents_per_kwh_at_1000)).toEqual([
      "10.50",
      "11.20",
    ]);
  });
});
