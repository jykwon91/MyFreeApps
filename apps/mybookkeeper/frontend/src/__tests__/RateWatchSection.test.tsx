/**
 * Unit tests for the "Check for rate increases" section.
 *
 * Three behaviours matter, and all three are about not overstating what the
 * filing data says:
 *
 * 1. A carrier with no filings under its name says so. Swyfft — the carrier on
 *    one of the operator's own policies — files nothing TDI publishes under
 *    that name, and an empty card would read as "no increases coming".
 * 2. A filing that was withdrawn or rejected is labelled "Not approved". As a
 *    bare percentage it is indistinguishable from one that took effect, and
 *    only one of them will ever appear on a bill.
 * 3. A feed outage is stated. The one thing this section must never do is
 *    render silence as good news.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RateWatchSection from "@/app/features/insurance/RateWatchSection";
import type { InsuranceMarketWatch } from "@/shared/types/insurance/insurance-market-watch";
import type { InsurancePolicyRateOutlook } from "@/shared/types/insurance/insurance-policy-rate-outlook";
import type { InsuranceRateFiling } from "@/shared/types/insurance/insurance-rate-filing";

const mockCheck = vi.fn();
let mockData: InsuranceMarketWatch | undefined;
let mockFetching = false;
let mockError = false;
let mockUninitialized = true;

vi.mock("@/shared/store/insuranceMarketApi", () => ({
  useLazyGetInsuranceRateWatchQuery: () => [
    mockCheck,
    {
      data: mockData,
      isFetching: mockFetching,
      isError: mockError,
      isUninitialized: mockUninitialized,
    },
  ],
}));

function filing(overrides: Partial<InsuranceRateFiling> = {}): InsuranceRateFiling {
  return {
    serff_id: "SFPT-134523456",
    company_name: "SAFEPOINT INSURANCE COMPANY",
    product_name: "TX DWO",
    percent_change: 11.1,
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
    policy_name: "Dwelling DP-3",
    property_name: "6738 Peerless St",
    carrier: "SafePoint",
    expiration_date: "2026-09-24",
    current_premium_cents: 241_000,
    filings: [filing()],
    projected_change_pct: 11.1,
    projected_premium_cents: 267_751,
    unavailable_reason: null,
    ...overrides,
  };
}

function watch(overrides: Partial<InsuranceMarketWatch> = {}): InsuranceMarketWatch {
  return {
    outlooks: [outlook()],
    market_filings: [filing()],
    has_any_increase: true,
    feed_unavailable_reason: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockData = undefined;
  mockFetching = false;
  mockError = false;
  mockUninitialized = true;
});

describe("RateWatchSection", () => {
  it("does not reach the department until asked", async () => {
    render(<RateWatchSection />);

    expect(screen.getByTestId("rate-watch-idle")).toBeInTheDocument();
    expect(mockCheck).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId("check-rate-filings-button"));
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  it("names both the property and the policy on every card", () => {
    // A property can carry a dwelling policy and a separate wind-only one.
    // Headed by property alone the two cards read as duplicates.
    mockUninitialized = false;
    mockData = watch({
      outlooks: [
        outlook({ policy_id: "policy-1", policy_name: "Dwelling DP-3" }),
        outlook({ policy_id: "policy-2", policy_name: "Wind and hail" }),
      ],
    });
    render(<RateWatchSection />);

    const cards = screen.getAllByTestId("rate-watch-outlook-card");
    expect(cards[0]).toHaveTextContent("6738 Peerless St · Dwelling DP-3");
    expect(cards[1]).toHaveTextContent("6738 Peerless St · Wind and hail");
  });

  it("shows a skeleton, not text, while checking", () => {
    mockFetching = true;
    mockUninitialized = false;
    render(<RateWatchSection />);

    expect(screen.getByTestId("rate-watch-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("rate-watch-results")).not.toBeInTheDocument();
  });

  it("projects the renewal premium from the filed increase", () => {
    mockUninitialized = false;
    mockData = watch();
    render(<RateWatchSection />);

    const projection = screen.getByTestId("rate-watch-outlook-projection");
    expect(projection).toHaveTextContent("$2,410/yr");
    expect(projection).toHaveTextContent("$2,678/yr");
    expect(projection).toHaveTextContent("+11.1%");
    // Never presented as a quote.
    expect(projection).toHaveTextContent("estimated");
  });

  it("says when a carrier has no filings rather than looking clear", () => {
    mockUninitialized = false;
    mockData = watch({
      outlooks: [
        outlook({
          carrier: "Benchmark/Swyfft",
          filings: [],
          projected_change_pct: null,
          projected_premium_cents: null,
          unavailable_reason:
            "No dwelling-line filings found under this carrier's name.",
        }),
      ],
    });
    render(<RateWatchSection />);

    expect(screen.getByTestId("rate-watch-outlook-unavailable")).toHaveTextContent(
      "No dwelling-line filings found under this carrier's name.",
    );
    expect(
      screen.queryByTestId("rate-watch-outlook-projection"),
    ).not.toBeInTheDocument();
  });

  it("reads a flat carrier as holding rates, not as plus zero", () => {
    mockUninitialized = false;
    mockData = watch({
      outlooks: [
        outlook({
          carrier: "Foremost",
          projected_change_pct: 0,
          projected_premium_cents: 241_000,
          filings: [filing({ percent_change: 0 })],
        }),
      ],
    });
    render(<RateWatchSection />);

    expect(screen.getByTestId("rate-watch-outlook-headline")).toHaveTextContent(
      "Foremost is holding rates flat",
    );
    expect(
      screen.queryByTestId("rate-watch-outlook-projection"),
    ).not.toBeInTheDocument();
  });

  it("labels a filing that never took effect", () => {
    mockUninitialized = false;
    mockData = watch({
      outlooks: [
        outlook({
          filings: [filing({ is_in_force: false, is_pending: false })],
        }),
      ],
      market_filings: [],
    });
    render(<RateWatchSection />);

    expect(screen.getAllByTestId("rate-watch-filing-row")[0]).toHaveTextContent(
      "Not approved",
    );
  });

  it("labels a filing the regulator has not ruled on", () => {
    mockUninitialized = false;
    mockData = watch({
      market_filings: [filing({ is_in_force: false, is_pending: true })],
    });
    render(<RateWatchSection />);

    expect(screen.getByTestId("rate-watch-market-list")).toHaveTextContent(
      "Proposed",
    );
  });

  it("states a feed outage instead of rendering silence", () => {
    mockUninitialized = false;
    mockData = watch({
      outlooks: [
        outlook({
          filings: [],
          projected_change_pct: null,
          projected_premium_cents: null,
          unavailable_reason:
            "The Texas Department of Insurance filing data could not be reached, so nothing was checked.",
        }),
      ],
      market_filings: [],
      has_any_increase: false,
      feed_unavailable_reason:
        "The Texas Department of Insurance filing data could not be reached, so nothing was checked.",
    });
    render(<RateWatchSection />);

    expect(screen.getByTestId("rate-watch-results")).toHaveTextContent(
      "could not be reached",
    );
  });

  it("explains an empty portfolio rather than showing a blank section", () => {
    mockUninitialized = false;
    mockData = watch({ outlooks: [] });
    render(<RateWatchSection />);

    expect(screen.getByTestId("rate-watch-empty")).toBeInTheDocument();
  });

  it("keeps a request failure away from the policy list", () => {
    mockUninitialized = false;
    mockError = true;
    render(<RateWatchSection />);

    expect(screen.getByTestId("rate-watch-error")).toHaveTextContent(
      "Nothing is wrong with your policies",
    );
  });
});
