/**
 * Unit tests for the offer→stat-block conversion.
 *
 * The feature's whole claim is that a listed offer is stated as a *movement*
 * against what a property already pays. These tests pin the two directions that
 * claim can go wrong: a cheaper offer that fails to read as an improvement, and
 * a dearer one that reads as an improvement anyway.
 */
import { describe, it, expect } from "vitest";
import {
  annualCostCents,
  bestSavingCents,
  buildOfferStats,
  offerVerdict,
} from "@/shared/lib/offer-stats";
import type { OfferStat } from "@/shared/types/utility/offer-stat";
import type { UtilityOffer } from "@/shared/types/utility/utility-offer";
import type { UtilityOfferGroup } from "@/shared/types/utility/utility-offer-group";

const REFERENCE_KWH = 12000;

function offer(overrides: Partial<UtilityOffer> = {}): UtilityOffer {
  return {
    external_plan_id: 1,
    provider_name: "Veteran Energy",
    plan_name: "Basic 12",
    term_months: 12,
    price_cents_per_kwh_at_500: "11.0",
    price_cents_per_kwh_at_1000: "10.5",
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

function group(overrides: Partial<UtilityOfferGroup> = {}): UtilityOfferGroup {
  return {
    property_id: "11111111-1111-1111-1111-111111111111",
    property_name: "6734 Peerless",
    zip_code: "77021",
    current_provider_name: "Constellation",
    current_price_cents_per_kwh_at_1000: "15.66",
    switch_cost_cents: 15000,
    offers: [],
    withheld_low_rated_count: 0,
    unavailable_reason: null,
    ...overrides,
  };
}

function stat(stats: OfferStat[], key: string): OfferStat {
  const found = stats.find((entry) => entry.key === key);
  if (!found) throw new Error(`no "${key}" stat was produced`);
  return found;
}

describe("annualCostCents", () => {
  it("multiplies the rate by the disclosure usage", () => {
    expect(annualCostCents("10.5", REFERENCE_KWH)).toBe(126000);
  });

  it("returns null rather than NaN for an unparseable rate", () => {
    expect(annualCostCents("", REFERENCE_KWH)).toBe(null);
  });
});

describe("buildOfferStats", () => {
  it("reads a cheaper rate as a fall, in words as well as direction", () => {
    const rate = stat(buildOfferStats(offer(), group(), REFERENCE_KWH), "rate");
    expect(rate.value).toBe("10.50¢");
    expect(rate.direction).toBe("better");
    expect(rate.delta).toBe("5.16¢ less");
  });

  it("reads a dearer rate as a rise", () => {
    const stats = buildOfferStats(
      offer({ price_cents_per_kwh_at_1000: "17.66", annual_saving_cents: -24000 }),
      group(),
      REFERENCE_KWH,
    );
    expect(stat(stats, "rate").direction).toBe("worse");
    expect(stat(stats, "rate").delta).toBe("2.00¢ more");
    expect(stat(stats, "yearly").direction).toBe("worse");
    expect(stat(stats, "yearly").delta).toBe("$240 more");
  });

  it("claims no movement when there is no current rate to move from", () => {
    const stats = buildOfferStats(
      offer({ annual_saving_cents: null }),
      group({ current_price_cents_per_kwh_at_1000: null }),
      REFERENCE_KWH,
    );
    expect(stat(stats, "rate").delta).toBe(null);
    expect(stat(stats, "rate").direction).toBe("neutral");
    expect(stat(stats, "yearly").delta).toBe(null);
  });

  it("says 'same' rather than a fake delta on a rounding-level difference", () => {
    const rate = stat(
      buildOfferStats(
        offer({ price_cents_per_kwh_at_1000: "15.662" }),
        group(),
        REFERENCE_KWH,
      ),
      "rate",
    );
    expect(rate.direction).toBe("same");
  });

  it("carries the exit fee, rating and term as the offer's own properties", () => {
    const stats = buildOfferStats(offer(), group(), REFERENCE_KWH);
    // These describe the candidate, not a movement — a delta here would imply a
    // comparison the current plan has no equivalent figure for.
    // Short form under an "Exit fee" heading — the label already says "exit fee".
    expect(stat(stats, "exit").value).toBe("$150");
    expect(stat(stats, "exit").delta).toBe(null);
    expect(stat(stats, "exit").hint).toContain("$150 exit fee");
    expect(stat(stats, "rating").value).toBe("3/5");
    expect(stat(stats, "rating").delta).toBe(null);
    expect(stat(stats, "term").value).toBe("12 months");
    expect(stat(stats, "term").direction).toBe("neutral");
  });

  it("never renders an unpublished exit fee as free", () => {
    const stats = buildOfferStats(
      offer({ cancellation_fee_cents: null }),
      group(),
      REFERENCE_KWH,
    );
    expect(stat(stats, "exit").value).toBe("Not published");
  });

  it("distinguishes a per-month exit fee from a flat one", () => {
    const stats = buildOfferStats(
      offer({
        cancellation_fee_cents: 2000,
        cancellation_fee_is_per_remaining_month: true,
      }),
      group(),
      REFERENCE_KWH,
    );
    expect(stat(stats, "exit").value).toBe("$20/mo left");
  });
});

describe("offerVerdict", () => {
  it("calls a teaser conditional however large its headline saving", () => {
    expect(offerVerdict(offer({ is_teaser_priced: true, annual_saving_cents: 90000 }))).toBe(
      "conditional",
    );
  });

  it("scales the word to the size of the saving", () => {
    expect(offerVerdict(offer({ annual_saving_cents: 61920 }))).toBe("major");
    expect(offerVerdict(offer({ annual_saving_cents: 20000 }))).toBe("solid");
    expect(offerVerdict(offer({ annual_saving_cents: 4000 }))).toBe("slight");
  });
});

describe("bestSavingCents", () => {
  it("takes the largest saving in the group", () => {
    expect(
      bestSavingCents(
        group({
          offers: [
            offer({ annual_saving_cents: 12000 }),
            offer({ annual_saving_cents: 61920 }),
            offer({ annual_saving_cents: null }),
          ],
        }),
      ),
    ).toBe(61920);
  });

  it("is zero for a group with nothing to offer", () => {
    expect(bestSavingCents(group({ offers: [] }))).toBe(0);
  });
});
