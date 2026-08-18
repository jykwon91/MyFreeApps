/**
 * Unit tests for the shortlist the operator reads to their agent.
 *
 * A Texas landlord policy is agent-placed — it cannot be quoted or bought
 * online — so the deliverable of the whole section is a handful of carrier
 * names and a date. These pin the two ways that goes wrong: an action item
 * appearing when there is nothing to act on, and the deadline disagreeing with
 * the one the verdict names.
 */
import { describe, it, expect } from "vitest";
import { buildRateWatchAction } from "@/shared/lib/rate-watch-action";
import { joinWithAnd } from "@/shared/lib/format-list";
import type { InsuranceMarketWatch } from "@/shared/types/insurance/insurance-market-watch";
import type { InsurancePolicyRateOutlook } from "@/shared/types/insurance/insurance-policy-rate-outlook";
import type { InsuranceRateFiling } from "@/shared/types/insurance/insurance-rate-filing";

function filing(overrides: Partial<InsuranceRateFiling> = {}): InsuranceRateFiling {
  return {
    serff_id: "SFPT-1",
    company_name: "SAFEPOINT INSURANCE COMPANY",
    product_name: "TX DWO",
    percent_change: 0,
    filed_date: "2026-05-28",
    effective_date_renewal: "2026-09-01",
    is_in_force: true,
    is_pending: false,
    ...overrides,
  };
}

function outlook(
  overrides: Partial<InsurancePolicyRateOutlook> = {},
): InsurancePolicyRateOutlook {
  return {
    policy_id: "policy-1",
    policy_name: "Dwelling Fire DP-3, 6738 Peerless St",
    policy_label: "Dwelling Fire DP-3",
    property_name: "6738 Peerless St",
    carrier: "SafePoint",
    is_checkable: true,
    expiration_date: "2026-09-24",
    current_premium_cents: 241_000,
    filings: [],
    projected_change_pct: 11.1,
    projected_premium_cents: 267_751,
    unavailable_reason: null,
    ...overrides,
  };
}

function watch(overrides: Partial<InsuranceMarketWatch> = {}): InsuranceMarketWatch {
  return {
    outlooks: [outlook()],
    market_rising: [],
    market_flat: [
      filing({ serff_id: "A", company_name: "FOREMOST LLOYDS OF TEXAS" }),
      filing({ serff_id: "B", company_name: "ALLSTATE VEHICLE AND PROPERTY" }),
      filing({ serff_id: "C", company_name: "TEXAS FARM BUREAU UNDERWRITERS" }),
      filing({ serff_id: "D", company_name: "STATE FARM LLOYDS" }),
    ],
    has_any_increase: true,
    checked_policy_count: 1,
    feed_unavailable_reason: null,
    ...overrides,
  };
}

describe("buildRateWatchAction", () => {
  it("names the carriers to quote and the renewal to beat", () => {
    const action = buildRateWatchAction(watch());

    expect(action?.renewalDate).toBe("2026-09-24");
    expect(action?.carrierNames).toEqual([
      "FOREMOST LLOYDS OF TEXAS",
      "ALLSTATE VEHICLE AND PROPERTY",
      "TEXAS FARM BUREAU UNDERWRITERS",
    ]);
  });

  it("caps the shortlist at something sayable on a phone call", () => {
    // Four carriers were available. A request for all of them is a research
    // project rather than a question — the rest stay under "Holding rates
    // flat" one scroll down.
    expect(buildRateWatchAction(watch())?.carrierNames).toHaveLength(3);
  });

  it("takes the deadline from the worst policy, as the verdict does", () => {
    // Deriving the date twice from the same array is how the callout and the
    // headline end up quoting different renewals.
    const action = buildRateWatchAction(
      watch({
        outlooks: [
          outlook({ policy_id: "a", projected_change_pct: 4 }),
          outlook({
            policy_id: "b",
            projected_change_pct: 19,
            expiration_date: "2027-02-17",
          }),
        ],
      }),
    );

    expect(action?.renewalDate).toBe("2027-02-17");
  });

  it("gives nothing when nothing is going up", () => {
    expect(
      buildRateWatchAction(
        watch({
          outlooks: [outlook({ projected_change_pct: 0 })],
          has_any_increase: false,
        }),
      ),
    ).toBeNull();
  });

  it("gives nothing when the feed could not be reached", () => {
    // An instruction built on a check that never ran would be a fabrication.
    expect(
      buildRateWatchAction(
        watch({ feed_unavailable_reason: "Could not reach the department." }),
      ),
    ).toBeNull();
  });

  it("gives nothing when no policy was checkable", () => {
    expect(buildRateWatchAction(watch({ checked_policy_count: 0 }))).toBeNull();
  });

  it("still returns an action when no carrier is holding flat", () => {
    // The increase is real; only the shortlist is empty. The component says
    // "ask whether anyone will quote you" rather than disappearing.
    const action = buildRateWatchAction(watch({ market_flat: [] }));

    expect(action).not.toBeNull();
    expect(action?.carrierNames).toEqual([]);
  });

  it("survives a policy with no recorded renewal date", () => {
    const action = buildRateWatchAction(
      watch({ outlooks: [outlook({ expiration_date: null })] }),
    );

    expect(action?.renewalDate).toBeNull();
  });
});

describe("joinWithAnd", () => {
  it("reads a list the way it would be said aloud", () => {
    expect(joinWithAnd(["Foremost", "Allstate", "Farm Bureau"])).toBe(
      "Foremost, Allstate and Farm Bureau",
    );
  });

  it("joins a pair without a comma", () => {
    expect(joinWithAnd(["Foremost", "Allstate"])).toBe("Foremost and Allstate");
  });

  it("leaves a single name alone", () => {
    expect(joinWithAnd(["Foremost"])).toBe("Foremost");
  });

  it("returns nothing for an empty list", () => {
    expect(joinWithAnd([])).toBe("");
  });
});
