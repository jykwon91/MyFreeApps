/**
 * Unit tests for the dashboard premium-comparison card.
 *
 * The behaviour worth protecting is the ``no-benchmark`` case: with no market
 * premium recorded, the card must say so rather than fall through to an
 * all-clear. Silence there would read as "your premiums are fine" when the
 * truth is "nothing was checked" — which is the exact failure this card exists
 * to fix, since a policy renews itself quietly every year at whatever the
 * carrier decides.
 *
 * The second thing pinned here is that "nothing tracked" and "all clear" stay
 * distinguishable. Both arrive as two empty lists; only ``total_considered``
 * tells them apart, and only one of them is good news.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import InsurancePremiumComparisonCard from "@/app/features/insurance/InsurancePremiumComparisonCard";
import type { InsuranceBenchmark } from "@/shared/types/insurance/insurance-benchmark";
import type { InsurancePolicySummary } from "@/shared/types/insurance/insurance-policy-summary";
import type { InsurancePremiumComparison } from "@/shared/types/insurance/insurance-premium-comparison";
import type { InsurancePremiumComparisonRow } from "@/shared/types/insurance/insurance-premium-comparison-row";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockRefetch = vi.fn();
let mockComparison: InsurancePremiumComparison | undefined;
let mockLoading = false;
let mockError = false;
let mockFetching = false;

vi.mock("@/shared/store/insuranceBenchmarksApi", () => ({
  useGetInsurancePremiumComparisonQuery: vi.fn(() => ({
    data: mockComparison,
    isLoading: mockLoading,
    isError: mockError,
    isFetching: mockFetching,
    refetch: mockRefetch,
  })),
}));

// ── Test data ────────────────────────────────────────────────────────────────

function makePolicy(
  overrides: Partial<InsurancePolicySummary> = {},
): InsurancePolicySummary {
  return {
    id: "policy-a",
    listing_id: "listing-1",
    policy_name: "Dwelling HO-3",
    carrier: "State Farm",
    effective_date: "2026-03-01",
    expiration_date: "2027-03-01",
    coverage_amount_cents: 40_000_000,
    premium_cents: 200_000,
    premium_frequency: "annual",
    deductible_cents: 250_000,
    wind_hail_deductible_pct: "2.00",
    annual_premium_cents: 200_000,
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

function makeRow(
  overrides: Partial<InsurancePremiumComparisonRow> = {},
): InsurancePremiumComparisonRow {
  return {
    policy: makePolicy(),
    status: "above_market",
    policy_rate_cents_per_1000: "500.00",
    benchmark_rate_cents_per_1000: "300.00",
    gap_pct: "66.7",
    benchmark_is_stale: false,
    ...overrides,
  };
}

function makeBenchmark(): InsuranceBenchmark {
  return {
    id: "bench-1",
    annual_premium_cents: 120_000,
    coverage_amount_cents: 40_000_000,
    region_label: "Harris County, TX",
    source: "TDI HelpInsure, HO-3, $2,500 deductible",
    observed_on: "2026-08-13",
    notes: null,
    rate_cents_per_1000_coverage: "300.00",
    is_stale: false,
    created_at: "2026-08-13T00:00:00Z",
    updated_at: "2026-08-13T00:00:00Z",
  };
}

function makeComparison(
  overrides: Partial<InsurancePremiumComparison> = {},
): InsurancePremiumComparison {
  return {
    material_gap_pct: 25,
    benchmark: makeBenchmark(),
    above_market: [],
    not_compared: [],
    total_above_market: 0,
    total_considered: 3,
    has_stale_benchmark: false,
    ...overrides,
  };
}

function renderCard() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <InsurancePremiumComparisonCard />
      </MemoryRouter>
    </Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockComparison = undefined;
  mockLoading = false;
  mockError = false;
  mockFetching = false;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("InsurancePremiumComparisonCard — when it renders at all", () => {
  it("renders nothing when the operator tracks no policies", () => {
    mockComparison = makeComparison({ total_considered: 0 });

    const { container } = renderCard();

    expect(container).toBeEmptyDOMElement();
  });

  it("prompts for a market premium rather than implying an all-clear", () => {
    mockComparison = makeComparison({ benchmark: null });

    renderCard();

    expect(
      screen.getByTestId("insurance-premium-comparison-card-no-benchmark"),
    ).toHaveTextContent("No market premium recorded yet");
    expect(
      screen.queryByTestId("insurance-premium-comparison-card-clear"),
    ).not.toBeInTheDocument();
  });

  it("points the no-benchmark prompt at the page that records one", () => {
    mockComparison = makeComparison({ benchmark: null });

    renderCard();

    expect(screen.getByRole("link", { name: "Record one" })).toHaveAttribute(
      "href",
      "/insurance-policies",
    );
  });

  it("states the all-clear once a benchmark exists and nothing is above it", () => {
    mockComparison = makeComparison();

    renderCard();

    expect(
      screen.getByTestId("insurance-premium-comparison-card-clear"),
    ).toHaveTextContent(
      "No policy costs more than 25% above the market premium you recorded",
    );
  });

  it("reads the threshold off the payload rather than hardcoding one", () => {
    mockComparison = makeComparison({ material_gap_pct: 40 });

    renderCard();

    expect(
      screen.getByTestId("insurance-premium-comparison-card-clear"),
    ).toHaveTextContent("more than 40% above");
  });

  it("shows a skeleton matching the loaded card while loading", () => {
    mockLoading = true;

    renderCard();

    const skeleton = screen.getByTestId(
      "insurance-premium-comparison-card-loading",
    );
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    // Two placeholder rows, each ending in a pill slot — the loaded shape.
    expect(skeleton.querySelectorAll(".rounded-full")).toHaveLength(2);
  });

  it("offers a retry when the comparison query fails", async () => {
    mockError = true;
    const user = userEvent.setup();

    renderCard();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("says the retry is in flight rather than looking unclicked", () => {
    mockError = true;
    mockFetching = true;

    renderCard();

    expect(screen.getByRole("button", { name: "Retrying..." })).toBeInTheDocument();
  });

  it("does not read a failed query as 'no policies tracked'", () => {
    // The two are indistinguishable in the payload but opposite in meaning:
    // one means nothing to check, the other means we do not know.
    mockError = true;
    mockComparison = undefined;

    renderCard();

    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("InsurancePremiumComparisonCard — above-market rows", () => {
  it("names the policy, both normalised figures, and the gap", () => {
    mockComparison = makeComparison({
      above_market: [makeRow()],
      total_above_market: 1,
    });

    renderCard();

    const row = screen.getByTestId("insurance-premium-comparison-policy-a");
    expect(row).toHaveTextContent("Dwelling HO-3");
    expect(row).toHaveTextContent("State Farm");
    // Normalised, not raw: cents per $1,000 of dwelling coverage.
    expect(row).toHaveTextContent("paying $5.00 per $1,000 vs market $3.00 per $1,000");
    expect(
      screen.getByTestId("insurance-premium-comparison-gap-policy-a"),
    ).toHaveTextContent("66.7% above market");
  });

  it("counts the flagged policies in the heading", () => {
    mockComparison = makeComparison({
      above_market: [
        makeRow(),
        makeRow({ policy: makePolicy({ id: "policy-b", policy_name: "Umbrella" }) }),
      ],
      total_above_market: 2,
    });

    renderCard();

    expect(screen.getByTestId("insurance-premium-comparison-card")).toHaveTextContent(
      "Paying above market (2)",
    );
    expect(
      screen.queryByTestId("insurance-premium-comparison-card-clear"),
    ).not.toBeInTheDocument();
  });

  it("marks a row measured against an ageing benchmark", () => {
    mockComparison = makeComparison({
      above_market: [makeRow({ benchmark_is_stale: true })],
      total_above_market: 1,
      has_stale_benchmark: true,
    });

    renderCard();

    expect(
      screen.getByTestId("insurance-premium-comparison-stale-policy-a"),
    ).toHaveTextContent("recorded a while ago");
  });
});

describe("InsurancePremiumComparisonCard — caveats on good news", () => {
  it("carries the staleness notice into the all-clear too", () => {
    // An all-clear resting on a year-old figure is a weaker claim than one
    // resting on a fresh one, and the reader cannot tell without being told.
    mockComparison = makeComparison({ has_stale_benchmark: true });

    renderCard();

    expect(
      screen.getByTestId("insurance-premium-comparison-stale-notice"),
    ).toHaveTextContent("recorded a while ago");
  });

  it("omits the staleness notice when the benchmark is fresh", () => {
    mockComparison = makeComparison();

    renderCard();

    expect(
      screen.queryByTestId("insurance-premium-comparison-stale-notice"),
    ).not.toBeInTheDocument();
  });

  it("lists the policies it could not measure, and why", () => {
    mockComparison = makeComparison({
      not_compared: [
        makeRow({
          policy: makePolicy({
            id: "policy-c",
            policy_name: "Flood",
            carrier: null,
            coverage_amount_cents: null,
          }),
          status: "not_comparable",
          policy_rate_cents_per_1000: null,
          benchmark_rate_cents_per_1000: "300.00",
          gap_pct: null,
        }),
      ],
    });

    renderCard();

    const block = screen.getByTestId("insurance-premium-comparison-not-compared");
    expect(block).toHaveTextContent("Not checked (1)");
    expect(
      screen.getByTestId("insurance-premium-not-compared-policy-c"),
    ).toHaveTextContent("Missing premium or coverage");
  });

  it("keeps the not-checked list visible alongside the all-clear", () => {
    // "Nothing was flagged" and "nothing was checked" look identical from the
    // outside — the list is what separates them.
    mockComparison = makeComparison({
      not_compared: [
        makeRow({
          policy: makePolicy({ id: "policy-c" }),
          status: "not_comparable",
        }),
      ],
    });

    renderCard();

    expect(
      screen.getByTestId("insurance-premium-comparison-card-clear"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("insurance-premium-comparison-not-compared"),
    ).toBeInTheDocument();
  });

  it("omits the not-checked block when every policy was measured", () => {
    mockComparison = makeComparison();

    renderCard();

    expect(
      screen.queryByTestId("insurance-premium-comparison-not-compared"),
    ).not.toBeInTheDocument();
  });
});
