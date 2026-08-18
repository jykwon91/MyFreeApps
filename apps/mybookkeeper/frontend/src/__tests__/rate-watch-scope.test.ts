/**
 * Unit tests for the line that accounts for every policy.
 *
 * The section handles a policy in one of three ways and only one of them
 * produces a visible answer. With three policies and one filed increase the
 * operator read the screen and asked "why do i only see options for 1 property
 * instead of all?" — so the count has to be stated rather than inferred from
 * how many cards look interesting.
 */
import { describe, it, expect } from "vitest";
import { formatScopeSummary } from "@/shared/lib/rate-watch-scope";
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

const quiet = outlook({ policy_id: "quiet", projected_change_pct: null });
const uncovered = outlook({
  policy_id: "uncovered",
  is_checkable: false,
  projected_change_pct: null,
});

describe("formatScopeSummary", () => {
  it("accounts for all three outcomes in one line", () => {
    // The operator's real portfolio: one increase, one carrier with nothing
    // filed, one policy the feed structurally cannot cover.
    expect(formatScopeSummary([outlook(), quiet, uncovered])).toBe(
      "Checked your 3 policies — 1 filed an increase, 1 with nothing filed, 1 this feed doesn't cover.",
    );
  });

  it("omits the outcomes that did not happen", () => {
    expect(formatScopeSummary([outlook(), outlook({ policy_id: "b" })])).toBe(
      "Checked your 2 policies — 2 filed an increase.",
    );
  });

  it("counts a policy the feed cannot cover as answered, not as failed", () => {
    // Wording matters as much as the count. A homeowners policy and a
    // surplus-lines carrier are permanently outside this dataset — that is an
    // answer, and calling it a failure would invite a pointless retry.
    expect(formatScopeSummary([uncovered])).toBe(
      "Checked your 1 policy — 1 this feed doesn't cover.",
    );
  });

  it("singularises a portfolio of one", () => {
    expect(formatScopeSummary([quiet])).toBe(
      "Checked your 1 policy — 1 with nothing filed.",
    );
  });

  it("does not claim a breakdown it has nothing to break down", () => {
    expect(formatScopeSummary([])).toBe("Checked your 0 policies.");
  });

  it("treats a decrease as nothing filed against the operator", () => {
    // Not an increase, and not uncovered. It belongs in the quiet bucket
    // rather than inflating the count of things to worry about.
    expect(
      formatScopeSummary([outlook({ projected_change_pct: -4.2 })]),
    ).toBe("Checked your 1 policy — 1 with nothing filed.");
  });
});
