/**
 * Unit tests for the "Check for rate increases" section.
 *
 * The shape here changed after the operator loaded the first cut in production
 * and said "i don't know what i'm looking at". These tests pin the fixes, and
 * every one of them is about the screen answering before it explains:
 *
 * 1. There is a verdict, in dollars, above the evidence.
 * 2. Silence is never the answer — an unmatched carrier, a policy the feed does
 *    not cover, and an outage each say which of the three they are.
 * 3. A filing that was withdrawn is labelled, because as a bare percentage it
 *    is indistinguishable from one that took effect.
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
    policy_name: "Dwelling Fire DP-3, 6738 Peerless St",
    policy_label: "Dwelling Fire DP-3",
    property_name: "6738 Peerless St",
    carrier: "SafePoint",
    is_checkable: true,
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
    market_rising: [filing()],
    market_flat: [],
    has_any_increase: true,
    checked_policy_count: 1,
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

  it("leads with the verdict in dollars, before any evidence", () => {
    // The whole point of the redesign. The percentage is the insurer's unit;
    // dollars per year is the one that changes the operator's budget.
    mockUninitialized = false;
    mockData = watch();
    render(<RateWatchSection />);

    const verdict = screen.getByTestId("rate-watch-verdict");
    expect(verdict).toHaveTextContent("6738 Peerless St");
    expect(verdict).toHaveTextContent("+$268/yr");
    expect(screen.getByTestId("rate-watch-verdict-detail")).toHaveTextContent(
      "SafePoint filed +11.1%",
    );
  });

  it("says so plainly when nothing is going up", () => {
    mockUninitialized = false;
    mockData = watch({
      outlooks: [
        outlook({ projected_change_pct: 0, projected_premium_cents: 241_000 }),
      ],
      has_any_increase: false,
      market_rising: [],
      market_flat: [filing({ percent_change: 0 })],
      checked_policy_count: 2,
    });
    render(<RateWatchSection />);

    expect(screen.getByTestId("rate-watch-verdict")).toHaveTextContent(
      "No rate increases filed against your 2 policies.",
    );
  });

  it("does not print the property address twice in one heading", () => {
    // policy_name carries the whole descriptor off the declarations page; the
    // heading already names the property, so it renders the stripped label.
    mockUninitialized = false;
    mockData = watch();
    render(<RateWatchSection />);

    const card = screen.getByTestId("rate-watch-outlook-card");
    expect(card).toHaveTextContent("6738 Peerless St · Dwelling Fire DP-3");
    expect(card.textContent?.match(/6738 Peerless St/g)).toHaveLength(1);
  });

  it("names both the property and the policy on every card", () => {
    // A property can carry a dwelling policy and a separate wind-only one.
    // Headed by property alone the two cards read as duplicates.
    mockUninitialized = false;
    mockData = watch({
      outlooks: [
        outlook({ policy_id: "policy-1", policy_label: "Dwelling Fire DP-3" }),
        outlook({ policy_id: "policy-2", policy_label: "Wind and hail" }),
      ],
    });
    render(<RateWatchSection />);

    const cards = screen.getAllByTestId("rate-watch-outlook-card");
    expect(cards[0]).toHaveTextContent("6738 Peerless St · Dwelling Fire DP-3");
    expect(cards[1]).toHaveTextContent("6738 Peerless St · Wind and hail");
  });

  it("shows a skeleton, not text, while checking", () => {
    mockFetching = true;
    mockUninitialized = false;
    render(<RateWatchSection />);

    expect(screen.getByTestId("rate-watch-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("rate-watch-results")).not.toBeInTheDocument();
  });

  it("projects the renewal premium with the dollar movement", () => {
    mockUninitialized = false;
    mockData = watch();
    render(<RateWatchSection />);

    const projection = screen.getByTestId("rate-watch-outlook-projection");
    expect(projection).toHaveTextContent("$2,410/yr");
    expect(projection).toHaveTextContent("$2,678/yr");
    expect(projection).toHaveTextContent("+$268/yr");
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
            "No landlord-policy rate filing found under this carrier's name in the last two years.",
        }),
      ],
      has_any_increase: false,
    });
    render(<RateWatchSection />);

    expect(screen.getByTestId("rate-watch-outlook-unavailable")).toHaveTextContent(
      "No landlord-policy rate filing found under this carrier's name",
    );
    expect(
      screen.queryByTestId("rate-watch-outlook-projection"),
    ).not.toBeInTheDocument();
  });

  it("footnotes a policy the feed never covered instead of giving it a card", () => {
    // An HO-3 is not a carrier-matching failure. The first cut gave it a
    // full-size card claiming a search that never ran.
    mockUninitialized = false;
    mockData = watch({
      outlooks: [
        outlook(),
        outlook({
          policy_id: "policy-ho3",
          policy_label: "Homeowners Policy (HO-3)",
          property_name: "6734 Peerless St",
          is_checkable: false,
          filings: [],
          projected_change_pct: null,
          projected_premium_cents: null,
          unavailable_reason: "Texas publishes rate filings for landlord policies only.",
        }),
      ],
    });
    render(<RateWatchSection />);

    expect(screen.getAllByTestId("rate-watch-outlook-card")).toHaveLength(1);
    expect(screen.getByTestId("rate-watch-out-of-scope")).toHaveTextContent(
      "6734 Peerless St",
    );
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
      has_any_increase: false,
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
      market_rising: [],
    });
    render(<RateWatchSection />);

    expect(screen.getAllByTestId("rate-watch-filing-row")[0]).toHaveTextContent(
      "Not approved",
    );
  });

  it("labels a filing the regulator has not ruled on", () => {
    mockUninitialized = false;
    mockData = watch({
      market_rising: [filing({ is_in_force: false, is_pending: true })],
    });
    render(<RateWatchSection />);

    expect(screen.getByTestId("rate-watch-market-rising")).toHaveTextContent(
      "Proposed",
    );
  });

  it("separates carriers holding flat from carriers raising", () => {
    mockUninitialized = false;
    mockData = watch({
      market_flat: [
        filing({
          serff_id: "FRMT-1",
          company_name: "FOREMOST LLOYDS OF TEXAS",
          percent_change: 0,
        }),
      ],
      market_rising: [filing()],
    });
    render(<RateWatchSection />);

    expect(screen.getByTestId("rate-watch-market-flat")).toHaveTextContent(
      "FOREMOST LLOYDS OF TEXAS",
    );
    expect(screen.getByTestId("rate-watch-market-rising")).toHaveTextContent(
      "SAFEPOINT INSURANCE COMPANY",
    );
  });

  it("states a feed outage and offers no verdict at all", () => {
    // The one outcome this must never produce: silence rendered as good news.
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
      market_rising: [],
      market_flat: [],
      has_any_increase: false,
      checked_policy_count: 0,
      feed_unavailable_reason:
        "The Texas Department of Insurance filing data could not be reached, so nothing was checked.",
    });
    render(<RateWatchSection />);

    expect(screen.getByTestId("rate-watch-results")).toHaveTextContent(
      "could not be reached",
    );
    expect(screen.queryByTestId("rate-watch-verdict")).not.toBeInTheDocument();
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
