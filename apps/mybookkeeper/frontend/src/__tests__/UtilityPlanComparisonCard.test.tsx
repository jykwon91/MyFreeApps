/**
 * Unit tests for the dashboard rate-comparison card.
 *
 * The behaviour worth protecting is the ``no-benchmark`` case: with nothing
 * recorded to compare against, the card must say so rather than fall through to
 * an all-clear. Silence there would read as "your rates are fine" when the
 * truth is "nothing was checked" — which is the exact failure this card exists
 * to fix, since a plan can sit comfortably inside its term and still be the
 * most expensive line in the portfolio.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import UtilityPlanComparisonCard from "@/app/features/utility/UtilityPlanComparisonCard";
import type { MarketRateBenchmark } from "@/shared/types/utility/market-rate-benchmark";
import type { UtilityPlanRateComparison } from "@/shared/types/utility/utility-plan-rate-comparison";
import type { UtilityPlanRateComparisonRow } from "@/shared/types/utility/utility-plan-rate-comparison-row";
import type { UtilityPlanSummary } from "@/shared/types/utility/utility-plan-summary";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockRefetch = vi.fn();
let mockComparison: UtilityPlanRateComparison | undefined;
let mockComparisonLoading = false;
let mockComparisonError = false;
let mockBenchmarks: MarketRateBenchmark[] = [];
let mockBenchmarksLoading = false;
let mockBenchmarksError = false;
let mockPlanTotal = 0;
let mockPlansLoading = false;
let mockPlansError = false;

vi.mock("@/shared/store/marketRateBenchmarksApi", () => ({
  useGetUtilityPlanRateComparisonQuery: vi.fn(() => ({
    data: mockComparison,
    isLoading: mockComparisonLoading,
    isError: mockComparisonError,
    isFetching: false,
    refetch: mockRefetch,
  })),
  useGetMarketRateBenchmarksQuery: vi.fn(() => ({
    data: mockBenchmarks,
    isLoading: mockBenchmarksLoading,
    isError: mockBenchmarksError,
  })),
}));

vi.mock("@/shared/store/utilityPlansApi", () => ({
  useGetUtilityPlansQuery: vi.fn(() => ({
    data: { items: [], total: mockPlanTotal, has_more: false },
    isLoading: mockPlansLoading,
    isError: mockPlansError,
  })),
}));

// ── Test data ────────────────────────────────────────────────────────────────

function makePlan(overrides: Partial<UtilityPlanSummary> = {}): UtilityPlanSummary {
  return {
    id: "plan-a",
    property_id: "prop-1",
    property_name: "6732 Peerless St",
    service_type: "electricity",
    provider_name: "Reliant",
    plan_name: "Truly Free Nights",
    rate_type: "fixed",
    avg_price_cents_per_kwh_at_1000: "15.0600",
    term_end_date: "2027-02-17",
    days_until_term_end: 190,
    renewal_status: "active",
    is_current: true,
    created_at: "2026-02-17T00:00:00Z",
    updated_at: "2026-02-17T00:00:00Z",
    ...overrides,
  };
}

function makeRow(
  overrides: Partial<UtilityPlanRateComparisonRow> = {},
): UtilityPlanRateComparisonRow {
  return {
    plan: makePlan(),
    status: "above_market",
    plan_figure: "15.0600",
    benchmark_figure: "11.1000",
    gap_pct: "35.7",
    benchmark_is_stale: false,
    ...overrides,
  };
}

function makeBenchmark(): MarketRateBenchmark {
  return {
    id: "bench-1",
    service_type: "electricity",
    rate_cents_per_kwh: "11.1000",
    monthly_cents: null,
    source: "Power to Choose, 77021",
    observed_on: "2026-08-11",
    notes: null,
    is_stale: false,
    created_at: "2026-08-11T00:00:00Z",
    updated_at: "2026-08-11T00:00:00Z",
  };
}

function renderCard() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <UtilityPlanComparisonCard />
      </MemoryRouter>
    </Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockComparison = undefined;
  mockComparisonLoading = false;
  mockComparisonError = false;
  mockBenchmarks = [];
  mockBenchmarksLoading = false;
  mockBenchmarksError = false;
  mockPlanTotal = 0;
  mockPlansLoading = false;
  mockPlansError = false;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("UtilityPlanComparisonCard — when it renders at all", () => {
  it("renders nothing when the operator tracks no utility plans", () => {
    mockPlanTotal = 0;
    mockBenchmarks = [makeBenchmark()];
    mockComparison = {
      material_gap_pct: 10,
      above_market: [],
      not_compared: [],
      total_above_market: 0,
      has_stale_benchmark: false,
    };

    const { container } = renderCard();

    expect(container).toBeEmptyDOMElement();
  });

  it("prompts for a market rate rather than implying an all-clear", () => {
    mockPlanTotal = 3;
    mockBenchmarks = [];
    mockComparison = {
      material_gap_pct: 10,
      above_market: [],
      not_compared: [],
      total_above_market: 0,
      has_stale_benchmark: false,
    };

    renderCard();

    expect(
      screen.getByTestId("utility-plan-comparison-card-no-benchmark"),
    ).toHaveTextContent("No market rate recorded yet");
    expect(
      screen.queryByTestId("utility-plan-comparison-card-clear"),
    ).not.toBeInTheDocument();
  });

  it("states the all-clear once a benchmark exists and nothing is above it", () => {
    mockPlanTotal = 3;
    mockBenchmarks = [makeBenchmark()];
    mockComparison = {
      material_gap_pct: 10,
      above_market: [],
      not_compared: [],
      total_above_market: 0,
      has_stale_benchmark: false,
    };

    renderCard();

    expect(
      screen.getByTestId("utility-plan-comparison-card-clear"),
    ).toHaveTextContent("No plan is priced more than 10% above the market rate");
  });

  it("shows a skeleton matching the loaded card while loading", () => {
    mockComparisonLoading = true;

    renderCard();

    const skeleton = screen.getByTestId("utility-plan-comparison-card-loading");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    // Two placeholder rows, each ending in a pill slot — the loaded shape.
    expect(skeleton.querySelectorAll(".rounded-full")).toHaveLength(2);
  });

  it("offers a retry when the comparison query fails", async () => {
    mockComparisonError = true;
    mockPlanTotal = 3;
    const user = userEvent.setup();

    renderCard();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("does not read a failed benchmarks query as 'none recorded'", () => {
    // The two are indistinguishable in the payload but opposite in meaning:
    // one means nothing to compare against, the other means we don't know.
    mockPlanTotal = 3;
    mockBenchmarksError = true;
    mockBenchmarks = [];
    mockComparison = {
      material_gap_pct: 10,
      above_market: [],
      not_compared: [],
      total_above_market: 0,
      has_stale_benchmark: false,
    };

    renderCard();

    expect(
      screen.queryByTestId("utility-plan-comparison-card-no-benchmark"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("does not read a failed plans query as 'no plans tracked'", () => {
    mockPlansError = true;
    mockPlanTotal = 0;
    mockBenchmarks = [makeBenchmark()];

    renderCard();

    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("UtilityPlanComparisonCard — above-market rows", () => {
  beforeEach(() => {
    mockPlanTotal = 3;
    mockBenchmarks = [makeBenchmark()];
  });

  it("names the property, both figures, and the gap", () => {
    mockComparison = {
      material_gap_pct: 10,
      above_market: [makeRow()],
      not_compared: [],
      total_above_market: 1,
      has_stale_benchmark: false,
    };

    renderCard();

    const row = screen.getByTestId("utility-plan-comparison-plan-a");
    expect(row).toHaveTextContent("6732 Peerless St");
    expect(row).toHaveTextContent("paying 15.06¢/kWh vs market 11.1¢/kWh");
    expect(screen.getByTestId("utility-plan-comparison-gap-plan-a")).toHaveTextContent(
      "35.7% above market",
    );
  });

  it("counts the flagged plans in the heading", () => {
    mockComparison = {
      material_gap_pct: 10,
      above_market: [
        makeRow(),
        makeRow({ plan: makePlan({ id: "plan-b", property_name: "6734 Peerless St" }) }),
      ],
      not_compared: [],
      total_above_market: 2,
      has_stale_benchmark: false,
    };

    renderCard();

    expect(screen.getByTestId("utility-plan-comparison-card")).toHaveTextContent(
      "Paying above market (2)",
    );
  });

  it("formats an internet row as a monthly amount, not a rate", () => {
    mockComparison = {
      material_gap_pct: 10,
      above_market: [
        makeRow({
          plan: makePlan({ id: "plan-net", service_type: "internet", provider_name: "AT&T" }),
          plan_figure: "9000",
          benchmark_figure: "6000",
          gap_pct: "50.0",
        }),
      ],
      not_compared: [],
      total_above_market: 1,
      has_stale_benchmark: false,
    };

    renderCard();

    expect(screen.getByTestId("utility-plan-comparison-plan-net")).toHaveTextContent(
      "paying $90.00/mo vs market $60.00/mo",
    );
  });

  it("caveats the whole set when a benchmark behind it is stale", () => {
    mockComparison = {
      material_gap_pct: 10,
      above_market: [makeRow({ benchmark_is_stale: true })],
      not_compared: [],
      total_above_market: 1,
      has_stale_benchmark: true,
    };

    renderCard();

    expect(
      screen.getByTestId("utility-plan-comparison-stale-notice"),
    ).toHaveTextContent("recorded a while ago");
  });

  it("omits the stale caveat when every benchmark is fresh", () => {
    mockComparison = {
      material_gap_pct: 10,
      above_market: [makeRow()],
      not_compared: [],
      total_above_market: 1,
      has_stale_benchmark: false,
    };

    renderCard();

    expect(
      screen.queryByTestId("utility-plan-comparison-stale-notice"),
    ).not.toBeInTheDocument();
  });

  it("marks which individual row rests on an old observation", () => {
    mockComparison = {
      material_gap_pct: 10,
      above_market: [
        makeRow({ benchmark_is_stale: true }),
        makeRow({ plan: makePlan({ id: "plan-fresh" }) }),
      ],
      not_compared: [],
      total_above_market: 2,
      has_stale_benchmark: true,
    };

    renderCard();

    expect(
      screen.getByTestId("utility-plan-comparison-stale-plan-a"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("utility-plan-comparison-stale-plan-fresh"),
    ).not.toBeInTheDocument();
  });
});

describe("UtilityPlanComparisonCard — what was not checked", () => {
  beforeEach(() => {
    mockPlanTotal = 3;
    mockBenchmarks = [makeBenchmark()];
  });

  it("lists unmeasured plans with the reason, alongside flagged ones", () => {
    mockComparison = {
      material_gap_pct: 10,
      above_market: [makeRow()],
      not_compared: [
        makeRow({
          plan: makePlan({ id: "plan-gas", service_type: "natural_gas" }),
          status: "not_comparable",
          plan_figure: null,
          benchmark_figure: null,
          gap_pct: null,
        }),
      ],
      total_above_market: 1,
      has_stale_benchmark: false,
    };

    renderCard();

    const row = screen.getByTestId("utility-plan-not-compared-plan-gas");
    expect(row).toHaveTextContent("Not comparable");
    expect(
      screen.getByTestId("utility-plan-comparison-not-compared"),
    ).toHaveTextContent("Not checked (1)");
  });

  it("qualifies the all-clear with what it did not measure", () => {
    // "Nothing was flagged" and "nothing was checked" look identical from the
    // outside, and only one of them is good news.
    mockComparison = {
      material_gap_pct: 10,
      above_market: [],
      not_compared: [
        makeRow({
          plan: makePlan({ id: "plan-gas", service_type: "natural_gas" }),
          status: "no_benchmark",
          plan_figure: null,
          benchmark_figure: null,
          gap_pct: null,
        }),
      ],
      total_above_market: 0,
      has_stale_benchmark: true,
    };

    renderCard();

    expect(screen.getByTestId("utility-plan-comparison-card-clear")).toBeInTheDocument();
    expect(
      screen.getByTestId("utility-plan-not-compared-plan-gas"),
    ).toHaveTextContent("No market rate recorded");
    // An all-clear resting on a stale observation must say so, exactly as the
    // above-market list does.
    expect(
      screen.getByTestId("utility-plan-comparison-stale-notice"),
    ).toBeInTheDocument();
  });
});
