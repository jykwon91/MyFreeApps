import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import RentalRoi from "@/app/features/analytics/RentalRoi";
import RentalRoiSkeleton from "@/app/features/analytics/RentalRoiSkeleton";
import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import type { RentalRoiResponse } from "@mybookkeeper/api-client/types/analytics/rental-roi-response";

vi.mock("@mybookkeeper/api-client/store/analyticsApi", () => ({
  useGetRentalRoiQuery: vi.fn(),
}));

import { useGetRentalRoiQuery } from "@mybookkeeper/api-client/store/analyticsApi";

type QueryResult = ReturnType<typeof useGetRentalRoiQuery>;

function property(overrides: Partial<RentalRoiProperty>): RentalRoiProperty {
  return {
    property_id: "prop-a",
    property_name: "Alpha",
    months_averaged: 12,
    has_purchase_price: true,
    mortgage_source: "records",
    break_even_monthly_cents: 160000,
    target_monthly_cents: 193333,
    actual_revenue_monthly_cents: 200000,
    gap_monthly_cents: 6667,
    gap_basis: "target",
    cash_invested_cents: 5000000,
    noi_annual_cents: 2280000,
    cap_rate_pct: "9.12",
    cash_on_cash_pct: "9.60",
    cost_breakdown: {
      debt_service_monthly_cents: 150000,
      operating_monthly_cents: 10000,
      mortgage_lines: [],
      operating_lines: [],
      escrow_covered_lines: [],
    },
    ...overrides,
  };
}

const ALPHA = property({});
const BETA = property({
  property_id: "prop-b",
  property_name: "Beta",
  has_purchase_price: false,
  mortgage_source: "transactions",
  break_even_monthly_cents: 100000,
  target_monthly_cents: null,
  actual_revenue_monthly_cents: 58000,
  gap_monthly_cents: -42000,
  gap_basis: "break_even",
  cash_invested_cents: null,
  cap_rate_pct: null,
  cash_on_cash_pct: null,
  months_averaged: 2,
});
const GAMMA = property({
  property_id: "prop-c",
  property_name: "Gamma",
  has_purchase_price: false,
  mortgage_source: "none",
  break_even_monthly_cents: 20000,
  target_monthly_cents: null,
  actual_revenue_monthly_cents: 50000,
  gap_monthly_cents: 30000,
  gap_basis: "break_even",
  cash_invested_cents: null,
  cap_rate_pct: null,
  cash_on_cash_pct: null,
});

function response(overrides: Partial<RentalRoiResponse> = {}): RentalRoiResponse {
  return {
    window_start: "2025-11-01",
    window_end: "2026-10-31",
    target_return_pct: "8",
    has_transactions: true,
    unassigned_revenue_monthly_cents: 0,
    summary: {
      property_count: 3,
      properties_with_target: 1,
      total_break_even_monthly_cents: 280000,
      total_target_monthly_cents: 193333,
      total_actual_revenue_monthly_cents: 308000,
      total_gap_monthly_cents: 28000,
      gap_basis: "break_even",
    },
    properties: [ALPHA, BETA, GAMMA],
    ...overrides,
  };
}

function mockQuery(result: Partial<QueryResult>) {
  vi.mocked(useGetRentalRoiQuery).mockReturnValue({
    data: undefined,
    error: undefined,
    isFetching: false,
    refetch: vi.fn(),
    ...result,
  } as unknown as QueryResult);
}

function lastTarget(): number {
  const calls = vi.mocked(useGetRentalRoiQuery).mock.calls;
  return (calls[calls.length - 1][0] as { targetReturnPct: number }).targetReturnPct;
}

function renderTab(path = "/analytics") {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <RentalRoi />
      </MemoryRouter>
    </Provider>,
  );
}

describe("RentalRoi headline", () => {
  beforeEach(() => vi.clearAllMocks());

  it("headlines the portfolio target when every property has one", () => {
    mockQuery({
      data: response({
        properties: [ALPHA],
        summary: {
          property_count: 1,
          properties_with_target: 1,
          total_break_even_monthly_cents: 160000,
          total_target_monthly_cents: 193333,
          total_actual_revenue_monthly_cents: 200000,
          total_gap_monthly_cents: 6667,
          gap_basis: "target",
        },
      }),
    });
    renderTab();
    const headline = screen.getByTestId("rental-roi-headline");
    expect(headline).toHaveAttribute("aria-live", "polite");
    expect(within(headline).getByRole("heading")).toHaveTextContent("You need $1,933/mo to hit your target");
    expect(within(headline).getByText("+$67")).toBeInTheDocument();
    expect(within(headline).getByText("$67 ahead")).toBeInTheDocument();
  });

  it("headlines break-even and says how many have a target when not all do", () => {
    mockQuery({ data: response() });
    renderTab();
    const headline = screen.getByTestId("rental-roi-headline");
    expect(within(headline).getByRole("heading")).toHaveTextContent("Break-even: $2,800/mo");
    expect(within(headline).getByText("target for 1 of 3 properties")).toBeInTheDocument();
    expect(within(headline).getByText("$280 ahead vs. break-even")).toBeInTheDocument();
    expect(within(headline).getByTestId("rental-roi-headline-actual")).toHaveTextContent("$3,080/mo");
  });

  it("states the window the numbers come from", () => {
    mockQuery({ data: response() });
    renderTab();
    expect(screen.getByText("Based on your last 12 months of approved transactions.")).toBeInTheDocument();
  });
});

describe("RentalRoi missing data", () => {
  beforeEach(() => vi.clearAllMocks());

  it("links a property with no purchase price to its edit card", () => {
    mockQuery({ data: response() });
    renderTab();
    const table = screen.getByRole("table");
    const links = within(table).getAllByRole("link", { name: "Add purchase price" });
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/properties?edit=prop-b", "/properties?edit=prop-c"]);
    const betaRow = within(table).getByRole("rowheader", { name: /Beta/ }).closest("tr") as HTMLElement;
    expect(within(betaRow).getByText("$420 short vs. break-even")).toBeInTheDocument();
    expect(within(betaRow).getByText("-$420")).toBeInTheDocument();
  });

  it("asks for the loan's original amount when a price is saved but there is still no target", () => {
    mockQuery({ data: response({ properties: [{ ...BETA, has_purchase_price: true }] }) });
    renderTab();
    const table = screen.getByRole("table");
    expect(within(table).queryByRole("link", { name: "Add purchase price" })).toBeNull();
    expect(within(table).getByRole("link", { name: "Add the loan's original amount" })).toHaveAttribute("href", "/mortgages");
  });

  it("explains where the mortgage came from, or that there isn't one", () => {
    mockQuery({ data: response() });
    renderTab();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Mortgage estimated from transactions")).toBeInTheDocument();
    expect(within(table).getByText(/No mortgage found — costs exclude it/)).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Add mortgage" })).toHaveAttribute("href", "/mortgages");
  });

  it("badges a property averaged over fewer than 3 months", () => {
    mockQuery({ data: response() });
    renderTab();
    expect(within(screen.getByRole("table")).getByText("Based on 2 months")).toBeInTheDocument();
  });

  it("notes revenue that isn't tied to a property", () => {
    mockQuery({ data: response({ unassigned_revenue_monthly_cents: 12500 }) });
    renderTab();
    const note = screen.getByTestId("rental-roi-unassigned");
    expect(note).toHaveTextContent("$125/mo of revenue isn't tied to a property.");
    expect(within(note).getByRole("link")).toHaveAttribute("href", "/transactions");
  });

  it("totals the target only over the properties that have one, and says so", () => {
    mockQuery({ data: response() });
    renderTab();
    const total = screen.getByTestId("rental-roi-total-row");
    expect(within(total).getByText("$1,933")).toBeInTheDocument();
    expect(within(total).getByText("1 of 3 properties")).toBeInTheDocument();
  });

  it("shows the cost breakdown and ratios behind Details", async () => {
    const user = userEvent.setup();
    mockQuery({ data: response() });
    renderTab();
    const table = screen.getByRole("table");
    const toggle = within(table).getByRole("button", { name: "Details for Alpha" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(table).getByText("$1,500/mo")).toBeInTheDocument();
    expect(within(table).getByText("9.6%")).toBeInTheDocument();
    expect(within(table).getByText("9.1%")).toBeInTheDocument();
    expect(within(table).getByText("Average of 12 months")).toBeInTheDocument();
  });

  it("renders a phone card per property after the total card", () => {
    mockQuery({ data: response() });
    renderTab();
    const cards = screen.getByTestId("rental-roi-cards");
    expect(within(cards).getByTestId("rental-roi-total-card")).toBeInTheDocument();
    expect(within(cards).getAllByTestId("rental-roi-card")).toHaveLength(3);
  });
});

describe("RentalRoi target return", () => {
  beforeEach(() => vi.clearAllMocks());

  it("defaults to 8%", () => {
    mockQuery({ data: response() });
    renderTab();
    expect(lastTarget()).toBe(8);
    expect(screen.getByLabelText("Target cash-on-cash return (%)")).toHaveValue("8");
  });

  it("clamps the URL value to 0–100 and reads junk as 8", () => {
    mockQuery({ data: response() });
    const { unmount } = renderTab("/analytics?target=250");
    expect(lastTarget()).toBe(100);
    unmount();
    renderTab("/analytics?target=abc");
    expect(lastTarget()).toBe(8);
  });

  it("refetches with the typed return after a pause, clamped", async () => {
    const user = userEvent.setup();
    mockQuery({ data: response() });
    renderTab();
    const input = screen.getByLabelText("Target cash-on-cash return (%)");
    await user.clear(input);
    await user.type(input, "12.5");
    await waitFor(() => expect(lastTarget()).toBe(12.5));

    await user.clear(input);
    await user.type(input, "400");
    await waitFor(() => expect(lastTarget()).toBe(100));
    await user.tab();
    expect(input).toHaveValue("100");
  });

  it("shows an inline updating note, not the skeleton, while refetching", () => {
    mockQuery({ data: response(), isFetching: true });
    renderTab();
    expect(screen.getByRole("status")).toHaveTextContent("Updating...");
    expect(screen.queryByTestId("rental-roi-skeleton")).not.toBeInTheDocument();
  });
});

describe("RentalRoi states", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the skeleton before the first load", () => {
    mockQuery({ data: undefined, isFetching: true });
    renderTab();
    expect(screen.getByTestId("rental-roi-skeleton")).toBeInTheDocument();
  });

  it("asks for a property when there are no rentals", () => {
    mockQuery({ data: response({ properties: [] }) });
    renderTab();
    expect(screen.getByText("Add a property to see what it needs to earn each month.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a property" })).toHaveAttribute("href", "/properties");
  });

  it("says when there are no approved transactions in the window", () => {
    mockQuery({ data: response({ has_transactions: false }) });
    renderTab();
    expect(screen.getByText("No approved transactions in the last 12 months yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Transactions" })).toHaveAttribute("href", "/transactions");
  });

  it("offers Retry on a failed load", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockQuery({ error: { status: 500, data: {} }, refetch });
    renderTab();
    expect(screen.getByText("Couldn't load your rental numbers.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("RentalRoiSkeleton", () => {
  it("mirrors the loaded layout: headline, input, 3 rows plus a total, 5 columns", () => {
    render(<RentalRoiSkeleton />);
    expect(screen.getByTestId("rental-roi-skeleton-headline")).toBeInTheDocument();
    expect(screen.getByTestId("rental-roi-skeleton-input")).toBeInTheDocument();
    expect(screen.getAllByTestId("rental-roi-skeleton-row")).toHaveLength(3);
    expect(screen.getByTestId("rental-roi-skeleton-total-row").children).toHaveLength(5);
    expect(screen.getByTestId("rental-roi-skeleton-cards").children).toHaveLength(4);
  });
});
