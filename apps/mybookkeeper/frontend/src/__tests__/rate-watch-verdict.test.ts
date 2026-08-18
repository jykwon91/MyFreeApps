/**
 * The verdict is the sentence the section leads with, so the failure modes that
 * matter are the ones where it would overstate what the data supports.
 */
import { describe, it, expect } from "vitest";
import { buildRateWatchVerdict } from "@/shared/lib/rate-watch-verdict";
import type { InsuranceMarketWatch } from "@/shared/types/insurance/insurance-market-watch";
import type { InsurancePolicyRateOutlook } from "@/shared/types/insurance/insurance-policy-rate-outlook";

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
    market_flat: [],
    has_any_increase: true,
    checked_policy_count: 1,
    feed_unavailable_reason: null,
    ...overrides,
  };
}

describe("buildRateWatchVerdict", () => {
  it("names the property and the dollar movement", () => {
    const verdict = buildRateWatchVerdict(watch());

    expect(verdict?.tone).toBe("alert");
    expect(verdict?.headline).toBe(
      "Your 6738 Peerless St renewal is going up about +$268/yr.",
    );
    // The qualifiers are the point: a filed percentage is a statewide average
    // lodged with the regulator, not a number anyone quoted for this address.
    expect(verdict?.detail).toContain(
      "SafePoint filed a +11.1% average rate increase with the state",
    );
    expect(verdict?.detail).toContain("in effect before your Sep 24, 2026 renewal");
  });

  it("picks the worst policy when several have increases", () => {
    const verdict = buildRateWatchVerdict(
      watch({
        outlooks: [
          outlook({ policy_id: "a", projected_change_pct: 4 }),
          outlook({
            policy_id: "b",
            property_name: "6732 Peerless St",
            projected_change_pct: 19,
            current_premium_cents: 200_000,
            projected_premium_cents: 238_000,
          }),
        ],
      }),
    );

    expect(verdict?.headline).toContain("6732 Peerless St");
    expect(verdict?.headline).toContain("+$380/yr");
  });

  it("gives a plain all-clear, counting only what was checked", () => {
    const verdict = buildRateWatchVerdict(
      watch({ has_any_increase: false, checked_policy_count: 3 }),
    );

    expect(verdict?.tone).toBe("clear");
    expect(verdict?.headline).toBe(
      "No rate increases filed against your 3 policies.",
    );
  });

  it("uses the singular for one policy", () => {
    const verdict = buildRateWatchVerdict(
      watch({ has_any_increase: false, checked_policy_count: 1 }),
    );

    expect(verdict?.headline).toBe("No rate increases filed against your policy.");
  });

  it("refuses to give a verdict when the feed was unreachable", () => {
    // The failure this exists to prevent: an outage rendering as an all-clear.
    expect(
      buildRateWatchVerdict(
        watch({
          has_any_increase: false,
          checked_policy_count: 0,
          feed_unavailable_reason: "could not be reached",
        }),
      ),
    ).toBeNull();
  });

  it("refuses to give a verdict when nothing was in scope to check", () => {
    // Every policy is a homeowners policy: "no increases" would be a claim
    // about a search that never ran.
    expect(
      buildRateWatchVerdict(
        watch({
          outlooks: [outlook({ is_checkable: false })],
          has_any_increase: false,
          checked_policy_count: 0,
        }),
      ),
    ).toBeNull();
  });

  it("falls back to a wording that needs no premium when none is recorded", () => {
    const verdict = buildRateWatchVerdict(
      watch({
        outlooks: [
          outlook({ current_premium_cents: null, projected_premium_cents: null }),
        ],
      }),
    );

    expect(verdict?.tone).toBe("alert");
    expect(verdict?.headline).toBe(
      "A rate increase is filed against your 6738 Peerless St policy.",
    );
  });
});
