/**
 * Unit tests for the "Check for better rates" section.
 *
 * The properties under test are the ones the insurance version got wrong and
 * the operator called out: every loan gets a card even when it could not be
 * compared, and the section states in words how many of them it actually
 * checked — "why do I only see one property" is a question the page has to
 * answer before it is asked.
 *
 * The skeleton is asserted against the loaded shape too, since a check that
 * reaches an external service is exactly where a layout shift lands.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MortgageRateWatchSection from "@/app/features/mortgages/MortgageRateWatchSection";
import type { MortgageRateWatch } from "@/shared/types/mortgage/mortgage-rate-watch";
import type { MortgageRefiOutlook } from "@/shared/types/mortgage/mortgage-refi-outlook";

const mockCheck = vi.fn();
let mockState: {
  data: MortgageRateWatch | undefined;
  isFetching: boolean;
  isError: boolean;
  isUninitialized: boolean;
};

vi.mock("@/shared/store/mortgageMarketApi", () => ({
  useLazyGetMortgageRateWatchQuery: vi.fn(() => [mockCheck, mockState]),
}));

vi.mock("@/app/features/mortgages/PropertyOccupancyFixer", () => ({
  // Stands in for the real control so the callback threading can be exercised
  // without re-testing the fixer itself — that lives in its own file.
  default: ({ onFixed }: { onFixed: () => void }) => (
    <button type="button" data-testid="occupancy-fixer" onClick={onFixed}>
      fix
    </button>
  ),
}));

function outlook(overrides: Partial<MortgageRefiOutlook> = {}): MortgageRefiOutlook {
  return {
    mortgage_id: "mtg-a",
    property_id: "property-1",
    property_name: "6734 Peerless",
    lender: "TDECU",
    rate_type: "fixed",
    current_rate_pct: "7.125",
    current_balance_cents: 33613735,
    is_checkable: true,
    unavailable_reason: null,
    verdict: "worth_pricing",
    survey_rate_pct: "6.67",
    survey_term_months: 360,
    survey_observed_on: "2026-08-13",
    comparable_rate_low_pct: "7.07",
    comparable_rate_high_pct: "7.52",
    remaining_term_months: 343,
    current_payment_cents: 229738,
    new_payment_low_cents: 224500,
    new_payment_high_cents: 234900,
    monthly_saving_low_cents: 12000,
    monthly_saving_high_cents: 28000,
    closing_cost_low_cents: 672275,
    closing_cost_high_cents: 1680687,
    breakeven_low_months: 24,
    breakeven_high_months: 34,
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

function setState(overrides: Partial<typeof mockState> = {}) {
  mockState = {
    data: undefined,
    isFetching: false,
    isError: false,
    isUninitialized: true,
    ...overrides,
  };
}

describe("MortgageRateWatchSection — before it has been run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setState();
  });

  it("explains what the check does rather than showing an empty box", () => {
    render(<MortgageRateWatchSection />);
    expect(screen.getByTestId("mortgage-rate-watch-idle")).toBeInTheDocument();
    expect(screen.getByText(/Freddie Mac publishes/i)).toBeInTheDocument();
  });

  it("does not reach the network on render — the check is explicit", () => {
    render(<MortgageRateWatchSection />);
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("runs the check on click", async () => {
    const user = userEvent.setup();
    render(<MortgageRateWatchSection />);
    await user.click(screen.getByTestId("check-mortgage-rates-button"));
    expect(mockCheck).toHaveBeenCalled();
  });
});

describe("MortgageRateWatchSection — while it is running", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setState({ isFetching: true, isUninitialized: false });
  });

  it("shows a skeleton with aria-busy", () => {
    render(<MortgageRateWatchSection />);
    const skeleton = screen.getByTestId("mortgage-rate-watch-loading");
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveAttribute("aria-busy", "true");
  });

  it("mirrors the loaded section: three cards, eight figure rows each", () => {
    render(<MortgageRateWatchSection />);
    const cards = screen
      .getByTestId("mortgage-rate-watch-loading")
      .querySelectorAll("li");
    expect(cards).toHaveLength(3);
    expect(cards[0].querySelectorAll(".contents")).toHaveLength(8);
  });

  it("shows progress on the button itself", () => {
    render(<MortgageRateWatchSection />);
    expect(screen.getByText("Checking rates...")).toBeInTheDocument();
  });
});

describe("MortgageRateWatchSection — results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setState({ isUninitialized: false, data: watch() });
  });

  it("leads with the verdict", () => {
    render(<MortgageRateWatchSection />);
    expect(screen.getByText(/worth pricing/i)).toBeInTheDocument();
  });

  it("states how many loans it compared", () => {
    render(<MortgageRateWatchSection />);
    expect(screen.getByTestId("mortgage-rate-watch-scope")).toHaveTextContent(
      "Compared your loan against this week's averages.",
    );
  });

  it("accounts for the loans it could not compare", () => {
    // The insurance version footnoted these, and an operator holding three
    // policies asked why only one property had been looked at.
    setState({
      isUninitialized: false,
      data: watch({
        outlooks: [
          outlook(),
          outlook({
            mortgage_id: "mtg-b",
            property_name: "6732 Peerless",
            rate_type: "arm",
            is_checkable: false,
            verdict: "not_checkable",
            unavailable_reason: "The rate on this loan can still move.",
          }),
        ],
        checked_mortgage_count: 1,
      }),
    });
    render(<MortgageRateWatchSection />);

    expect(screen.getByTestId("mortgage-rate-watch-scope")).toHaveTextContent(
      "Compared 1 of your 2 loans against this week's averages. The other one says below why it couldn't be.",
    );
    expect(screen.getAllByTestId("mortgage-outlook-card")).toHaveLength(2);
    expect(screen.getByTestId("mortgage-outlook-unavailable")).toHaveTextContent(
      "The rate on this loan can still move.",
    );
  });

  it("shows the arithmetic behind a checkable loan", () => {
    render(<MortgageRateWatchSection />);
    const numbers = screen.getByTestId("mortgage-outlook-numbers");
    expect(numbers).toHaveTextContent("7.125%");
    expect(numbers).toHaveTextContent("7.07% – 7.52%");
    expect(numbers).toHaveTextContent("28 years, 7 months");
    expect(numbers).toHaveTextContent("$120 – $280");
    expect(numbers).toHaveTextContent("$6,723 – $16,807");
    expect(numbers).toHaveTextContent("2 years to 2 years, 10 months");
  });

  it("cites the benchmark it measured against, and its date", () => {
    render(<MortgageRateWatchSection />);
    const survey = screen.getByTestId("mortgage-rate-watch-survey");
    expect(survey).toHaveTextContent("Aug 13, 2026");
    expect(survey).toHaveTextContent("6.67%");
    expect(survey).toHaveTextContent("5.96%");
    expect(survey).toHaveTextContent("only a lender can give you one");
  });

  it("re-runs the check when a card clears its blocker", async () => {
    // Covered here rather than only in the fixer's own test: the callback has
    // to be threaded through three components to reach the query, and a broken
    // thread leaves the operator staring at a blocker they just cleared.
    setState({
      isUninitialized: false,
      data: watch({
        outlooks: [
          outlook({
            is_checkable: false,
            verdict: "not_checkable",
            unavailable_reason: "This property isn't marked as a rental yet.",
          }),
        ],
        checked_mortgage_count: 0,
      }),
    });
    const user = userEvent.setup();
    render(<MortgageRateWatchSection />);

    await user.click(screen.getByTestId("occupancy-fixer"));
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });
});

describe("MortgageRateWatchSection — degraded states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("says the loans are fine when the feed is what failed", () => {
    setState({ isUninitialized: false, isError: true });
    render(<MortgageRateWatchSection />);
    expect(screen.getByTestId("mortgage-rate-watch-error")).toHaveTextContent(
      /Nothing is wrong with your loans/i,
    );
  });

  it("gives no verdict on a partial outage, but still lists every loan", () => {
    // "Nothing to do" and "nothing was measured" look identical to a reader
    // and mean opposite things.
    setState({
      isUninitialized: false,
      data: watch({
        outlooks: [
          outlook({
            is_checkable: false,
            verdict: "not_checkable",
            unavailable_reason: "This week's rate data couldn't be reached.",
          }),
        ],
        survey_30_year_pct: null,
        survey_15_year_pct: null,
        survey_observed_on: null,
        checked_mortgage_count: 0,
        feed_unavailable_reason: "This week's rate data couldn't be reached.",
      }),
    });
    render(<MortgageRateWatchSection />);

    expect(screen.getAllByTestId("mortgage-outlook-card")).toHaveLength(1);
    expect(screen.queryByText(/Nothing worth refinancing/i)).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("mortgage-rate-watch-survey"),
    ).not.toBeInTheDocument();
  });

  it("points at the loan list when there is nothing on file", () => {
    setState({ isUninitialized: false, data: watch({ outlooks: [], checked_mortgage_count: 0 }) });
    render(<MortgageRateWatchSection />);
    expect(screen.getByTestId("mortgage-rate-watch-empty")).toBeInTheDocument();
  });
});
