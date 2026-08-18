/**
 * Unit tests for the sentence the rate-watch section leads with.
 *
 * Two properties are load-bearing. The verdict must return null — not an
 * all-clear — whenever nothing was actually checked, because "nothing to do"
 * and "nothing was measured" look identical to a reader and mean opposite
 * things. And only ``worth_pricing`` may raise the tone: a marginal gap is
 * worth explaining but is not an action item, and dressing it up as one sends
 * the operator to a lender over a loan that does not pay back.
 */
import { describe, it, expect } from "vitest";
import {
  bestByVerdict,
  buildMortgageRateWatchVerdict,
} from "@/shared/lib/mortgage-rate-watch-verdict";
import type { MortgageRateWatch } from "@/shared/types/mortgage/mortgage-rate-watch";
import type { MortgageRefiOutlook } from "@/shared/types/mortgage/mortgage-refi-outlook";

function outlook(overrides: Partial<MortgageRefiOutlook> = {}): MortgageRefiOutlook {
  return {
    mortgage_id: "11111111-1111-1111-1111-111111111111",
    property_id: "44444444-4444-4444-4444-444444444444",
    property_name: "6734 Peerless",
    lender: "TDECU",
    rate_type: "fixed",
    current_rate_pct: "7.125",
    current_balance_cents: 33613735,
    is_checkable: true,
    unavailable_reason: null,
    verdict: "no_action",
    survey_rate_pct: "6.67",
    survey_term_months: 360,
    survey_observed_on: "2026-08-13",
    comparable_rate_low_pct: "7.07",
    comparable_rate_high_pct: "7.52",
    remaining_term_months: 343,
    current_payment_cents: 229738,
    new_payment_low_cents: 224500,
    new_payment_high_cents: 234900,
    monthly_saving_low_cents: 0,
    monthly_saving_high_cents: 5238,
    closing_cost_low_cents: 672275,
    closing_cost_high_cents: 1680687,
    breakeven_low_months: 129,
    breakeven_high_months: null,
    ...overrides,
  };
}

function watch(overrides: Partial<MortgageRateWatch> = {}): MortgageRateWatch {
  return {
    outlooks: [outlook()],
    survey_30_year_pct: "6.67",
    survey_15_year_pct: "5.96",
    survey_observed_on: "2026-08-13",
    checked_mortgage_count: 1,
    feed_unavailable_reason: null,
    ...overrides,
  };
}

describe("buildMortgageRateWatchVerdict", () => {
  it("gives no verdict when the survey could not be reached", () => {
    // Nothing was measured. An all-clear here would be a claim about loans
    // that were never compared.
    const result = buildMortgageRateWatchVerdict(
      watch({ feed_unavailable_reason: "feed_unavailable" }),
    );
    expect(result).toBeNull();
  });

  it("gives no verdict when nothing was checkable", () => {
    const result = buildMortgageRateWatchVerdict(
      watch({
        checked_mortgage_count: 0,
        outlooks: [outlook({ is_checkable: false, verdict: "not_checkable" })],
      }),
    );
    expect(result).toBeNull();
  });

  it("leads with the all-clear when every loan is at or below market", () => {
    const result = buildMortgageRateWatchVerdict(watch());
    expect(result?.tone).toBe("clear");
    expect(result?.headline).toBe("Nothing worth refinancing across your loan.");
  });

  it("counts the loans it checked in the all-clear", () => {
    const result = buildMortgageRateWatchVerdict(
      watch({
        checked_mortgage_count: 3,
        outlooks: [outlook(), outlook(), outlook()],
      }),
    );
    expect(result?.headline).toBe("Nothing worth refinancing across your 3 loans.");
  });

  it("raises the tone only for a loan worth pricing", () => {
    const result = buildMortgageRateWatchVerdict(
      watch({
        outlooks: [
          outlook({
            verdict: "worth_pricing",
            monthly_saving_low_cents: 12000,
            monthly_saving_high_cents: 28000,
            breakeven_low_months: 24,
            breakeven_high_months: 34,
          }),
        ],
      }),
    );
    expect(result?.tone).toBe("alert");
    expect(result?.headline).toContain("6734 Peerless");
    expect(result?.headline).toContain("$120 – $280");
    expect(result?.detail).toContain("7.125%");
    expect(result?.detail).toContain("7.07% – 7.52%");
    expect(result?.detail).toContain("2 years to 2 years, 10 months");
  });

  it("names a marginal loan but keeps the clear tone", () => {
    const result = buildMortgageRateWatchVerdict(
      watch({ outlooks: [outlook({ verdict: "marginal" })] }),
    );
    expect(result?.tone).toBe("clear");
    expect(result?.headline).toContain("above the market");
    expect(result?.headline).toContain("not by enough");
  });

  it("prefers the actionable loan over the marginal one", () => {
    const result = buildMortgageRateWatchVerdict(
      watch({
        checked_mortgage_count: 2,
        outlooks: [
          outlook({ property_name: "6738 Peerless", verdict: "marginal" }),
          outlook({
            property_name: "6732 Peerless",
            verdict: "worth_pricing",
            monthly_saving_low_cents: 9000,
          }),
        ],
      }),
    );
    expect(result?.tone).toBe("alert");
    expect(result?.headline).toContain("6732 Peerless");
  });
});

describe("bestByVerdict", () => {
  it("ranks on the conservative saving, not the optimistic one", () => {
    // The loan that leads has to be the one whose case survives the comparable
    // rate landing at the top of its band.
    const modest = outlook({
      property_name: "modest",
      verdict: "worth_pricing",
      monthly_saving_low_cents: 9000,
      monthly_saving_high_cents: 40000,
    });
    const solid = outlook({
      property_name: "solid",
      verdict: "worth_pricing",
      monthly_saving_low_cents: 15000,
      monthly_saving_high_cents: 20000,
    });
    expect(bestByVerdict([modest, solid], "worth_pricing")?.property_name).toBe(
      "solid",
    );
  });

  it("ignores loans with a different verdict", () => {
    const marginal = outlook({
      verdict: "marginal",
      monthly_saving_low_cents: 99999,
    });
    const pricing = outlook({
      property_name: "6732 Peerless",
      verdict: "worth_pricing",
      monthly_saving_low_cents: 100,
    });
    expect(bestByVerdict([marginal, pricing], "worth_pricing")?.property_name).toBe(
      "6732 Peerless",
    );
  });

  it("returns null when no loan carries the verdict", () => {
    expect(bestByVerdict([outlook()], "worth_pricing")).toBeNull();
  });

  it("treats an unknown saving as the weakest case rather than skipping it", () => {
    const unknown = outlook({
      verdict: "worth_pricing",
      monthly_saving_low_cents: null,
    });
    expect(bestByVerdict([unknown], "worth_pricing")).toBe(unknown);
  });
});
