/**
 * Unit tests for the market-premium summary on the policies page.
 *
 * The summary exists so the number driving the above-market flag is visible
 * next to the policies it judges. A benchmark the operator cannot see is one
 * they cannot tell has gone stale — so both the figure and its age are pinned
 * here, as is the empty state, which must read as "nothing is being checked"
 * rather than as silence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InsuranceBenchmarkSummary from "@/app/features/insurance/InsuranceBenchmarkSummary";
import type { InsuranceBenchmark } from "@/shared/types/insurance/insurance-benchmark";

// ── Mocks ───────────────────────────────────────────────────────────────────

let mockBenchmark: InsuranceBenchmark | null = null;
let mockLoading = false;

vi.mock("@/shared/store/insuranceBenchmarksApi", () => ({
  useGetInsuranceBenchmarkQuery: vi.fn(() => ({
    data: mockBenchmark,
    isLoading: mockLoading,
  })),
}));

// ── Test data ────────────────────────────────────────────────────────────────

function makeBenchmark(overrides: Partial<InsuranceBenchmark> = {}): InsuranceBenchmark {
  return {
    id: "bench-1",
    annual_premium_cents: 120_000,
    coverage_amount_cents: 40_000_000,
    region_label: "Harris County, TX",
    source: "TDI HelpInsure, HO-3, $2,500 deductible",
    observed_on: "2026-08-01",
    notes: null,
    rate_cents_per_1000_coverage: "300.00",
    is_stale: false,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

const onEdit = vi.fn();

function renderSummary() {
  return render(<InsuranceBenchmarkSummary onEdit={onEdit} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBenchmark = null;
  mockLoading = false;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("InsuranceBenchmarkSummary — nothing recorded", () => {
  it("says nothing is being checked rather than staying silent", () => {
    renderSummary();

    expect(screen.getByTestId("insurance-benchmark-summary-empty")).toHaveTextContent(
      "No market premium recorded, so no policy is being checked for overpaying.",
    );
  });

  it("opens the editor from the empty state", async () => {
    const user = userEvent.setup();
    renderSummary();

    await user.click(screen.getByRole("button", { name: "Record one" }));

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("shows a placeholder rather than the empty state while loading", () => {
    mockLoading = true;

    renderSummary();

    expect(screen.getByTestId("insurance-benchmark-summary-loading")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(
      screen.queryByTestId("insurance-benchmark-summary-empty"),
    ).not.toBeInTheDocument();
  });
});

describe("InsuranceBenchmarkSummary — a recorded premium", () => {
  it("shows the premium, the coverage it buys, and the normalised rate", () => {
    mockBenchmark = makeBenchmark();

    renderSummary();

    expect(screen.getByTestId("insurance-benchmark-summary-figure")).toHaveTextContent(
      "$1,200/yr on $400,000 of dwelling coverage — $3.00 per $1,000",
    );
  });

  it("names where the figure came from and when it was seen", () => {
    mockBenchmark = makeBenchmark();

    renderSummary();

    const summary = screen.getByTestId("insurance-benchmark-summary");
    expect(summary).toHaveTextContent("Harris County, TX");
    expect(summary).toHaveTextContent("TDI HelpInsure, HO-3, $2,500 deductible");
    expect(summary).toHaveTextContent("seen Aug 1, 2026");
  });

  it("renders the date from the plain date string without a timezone shift", () => {
    // parseISO on a date-only string stays local; `new Date(...)` would parse it
    // as UTC midnight and render the previous day west of Greenwich.
    mockBenchmark = makeBenchmark({ observed_on: "2026-01-01" });

    renderSummary();

    expect(screen.getByTestId("insurance-benchmark-summary")).toHaveTextContent(
      "seen Jan 1, 2026",
    );
  });

  it("flags an ageing figure as worth rechecking", () => {
    mockBenchmark = makeBenchmark({ is_stale: true });

    renderSummary();

    expect(screen.getByTestId("insurance-benchmark-summary-stale")).toHaveTextContent(
      "worth rechecking",
    );
  });

  it("does not flag a fresh figure", () => {
    mockBenchmark = makeBenchmark();

    renderSummary();

    expect(
      screen.queryByTestId("insurance-benchmark-summary-stale"),
    ).not.toBeInTheDocument();
  });

  it("omits the region and source separators when neither was recorded", () => {
    mockBenchmark = makeBenchmark({ region_label: null, source: null });

    renderSummary();

    const summary = screen.getByTestId("insurance-benchmark-summary");
    expect(summary).toHaveTextContent("seen Aug 1, 2026");
    expect(summary).not.toHaveTextContent("·");
  });

  it("opens the editor from the update link", async () => {
    mockBenchmark = makeBenchmark();
    const user = userEvent.setup();
    renderSummary();

    await user.click(screen.getByTestId("insurance-benchmark-summary-edit"));

    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
