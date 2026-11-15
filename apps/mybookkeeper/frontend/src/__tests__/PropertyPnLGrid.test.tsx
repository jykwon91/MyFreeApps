import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import PropertyPnLGrid from "@/app/features/attribution/PropertyPnLGrid";
import type { PropertyPnLResponse } from "@mybookkeeper/api-client/types/attribution/property-pnl-response";

const emptyPnl: PropertyPnLResponse = {
  since: "2026-01-01",
  until: "2026-03-31",
  properties: [],
  total_revenue_cents: 0,
  total_expenses_cents: 0,
  total_net_cents: 0,
};

const pnlWithData: PropertyPnLResponse = {
  since: "2026-01-01",
  until: "2026-03-31",
  properties: [
    {
      property_id: "prop-1",
      name: "Beach House",
      revenue_cents: 300000,
      expenses_cents: 50000,
      net_cents: 250000,
      expense_breakdown: [
        { category: "maintenance", amount_cents: 30000 },
        { category: "insurance", amount_cents: 20000 },
      ],
    },
    {
      property_id: "prop-2",
      name: "Mountain Cabin",
      revenue_cents: 150000,
      expenses_cents: 80000,
      net_cents: 70000,
      expense_breakdown: [],
    },
  ],
  total_revenue_cents: 450000,
  total_expenses_cents: 130000,
  total_net_cents: 320000,
};

vi.mock("@mybookkeeper/api-client/store/attributionApi", () => ({
  useGetPropertyPnlQuery: vi.fn(),
}));

import { useGetPropertyPnlQuery } from "@mybookkeeper/api-client/store/attributionApi";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}

describe("PropertyPnLGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders skeleton while loading", () => {
    vi.mocked(useGetPropertyPnlQuery).mockReturnValue({
      currentData: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useGetPropertyPnlQuery>);

    renderWithProviders(
      <PropertyPnLGrid since="2026-01-01" until="2026-03-31" />,
    );
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows empty state when no data", () => {
    vi.mocked(useGetPropertyPnlQuery).mockReturnValue({
      currentData: emptyPnl,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetPropertyPnlQuery>);

    renderWithProviders(
      <PropertyPnLGrid since="2026-01-01" until="2026-03-31" />,
    );
    expect(
      screen.getByText("No property data for this period."),
    ).toBeInTheDocument();
  });

  it("renders roll-up totals correctly", () => {
    vi.mocked(useGetPropertyPnlQuery).mockReturnValue({
      currentData: pnlWithData,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetPropertyPnlQuery>);

    renderWithProviders(
      <PropertyPnLGrid since="2026-01-01" until="2026-03-31" />,
    );
    // total_revenue = 450000 cents = $4,500.00
    expect(screen.getByText("$4,500.00")).toBeInTheDocument();
    // total_expenses = 130000 cents = $1,300.00
    expect(screen.getByText("$1,300.00")).toBeInTheDocument();
    // total_net = 320000 cents = $3,200.00
    expect(screen.getByText("$3,200.00")).toBeInTheDocument();
  });

  it("renders per-property cards", () => {
    vi.mocked(useGetPropertyPnlQuery).mockReturnValue({
      currentData: pnlWithData,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetPropertyPnlQuery>);

    renderWithProviders(
      <PropertyPnLGrid since="2026-01-01" until="2026-03-31" />,
    );
    expect(screen.getByText("Beach House")).toBeInTheDocument();
    expect(screen.getByText("Mountain Cabin")).toBeInTheDocument();
  });

  it("renders net amounts on property cards", () => {
    vi.mocked(useGetPropertyPnlQuery).mockReturnValue({
      currentData: pnlWithData,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetPropertyPnlQuery>);

    renderWithProviders(
      <PropertyPnLGrid since="2026-01-01" until="2026-03-31" />,
    );
    // Beach House net = 250000 cents = $2,500.00
    expect(screen.getByText("$2,500.00")).toBeInTheDocument();
    // Mountain Cabin net = 70000 cents = $700.00
    expect(screen.getByText("$700.00")).toBeInTheDocument();
  });

  it("skeleton has same grid structure as loaded state", () => {
    // Skeleton renders roll-up row (3 items) + property grid (3 items)
    vi.mocked(useGetPropertyPnlQuery).mockReturnValue({
      currentData: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useGetPropertyPnlQuery>);

    const { container } = renderWithProviders(
      <PropertyPnLGrid since="2026-01-01" until="2026-03-31" />,
    );
    const skeletons = container.querySelectorAll(".animate-pulse");
    // 3 roll-up + 3 property = 6 skeleton items
    expect(skeletons.length).toBe(6);
  });
  describe("after a different range is picked", () => {
    const refetch = vi.fn();

    /**
     * What RTK's hook returns: Q1's settled answer for Q1, and for any other
     * range `data` still holding Q1's totals (it keeps the last result) while
     * `currentData` has nothing yet.
     */
    function answerFirstQuarterOnly(pickedRangeState: { isFetching: boolean; error?: unknown }) {
      vi.mocked(useGetPropertyPnlQuery).mockImplementation(((args: { since: string }) =>
        args.since === "2026-01-01"
          ? { data: pnlWithData, currentData: pnlWithData, isLoading: false, isFetching: false, refetch }
          : {
              data: pnlWithData,
              currentData: undefined,
              isLoading: false,
              isError: pickedRangeState.error !== undefined,
              refetch,
              ...pickedRangeState,
            }) as unknown as typeof useGetPropertyPnlQuery);
    }

    function pickSecondQuarter() {
      const view = renderWithProviders(<PropertyPnLGrid since="2026-01-01" until="2026-03-31" />);
      expect(screen.getByText("$4,500.00")).toBeInTheDocument();
      view.rerender(
        <Provider store={store}>
          <BrowserRouter>
            <PropertyPnLGrid since="2026-04-01" until="2026-06-30" />
          </BrowserRouter>
        </Provider>,
      );
    }

    function expectNoFirstQuarterFigures() {
      expect(screen.queryByText("$4,500.00")).not.toBeInTheDocument();
      expect(screen.queryByText("Beach House")).not.toBeInTheDocument();
      // Its cards would drill into the new range under the old range's amounts.
      expect(screen.queryByRole("button", { name: /View transactions for/ })).not.toBeInTheDocument();
    }

    it("shows the skeleton, not the previous range's P&L, while it loads", () => {
      answerFirstQuarterOnly({ isFetching: true });
      pickSecondQuarter();

      expectNoFirstQuarterFigures();
      expect(screen.getByTestId("property-pnl-skeleton")).toBeInTheDocument();
    });

    it("shows an error with Retry, not the previous range's P&L, when it fails", async () => {
      answerFirstQuarterOnly({ isFetching: false, error: { status: 500 } });
      pickSecondQuarter();

      expectNoFirstQuarterFigures();
      expect(screen.queryByTestId("property-pnl-skeleton")).not.toBeInTheDocument();
      expect(
        screen.getByText("I couldn't load your property P&L for this period. Want me to try again?"),
      ).toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it("keeps the error up, retrying, while Retry refetches", () => {
      answerFirstQuarterOnly({ isFetching: true, error: { status: 500 } });
      pickSecondQuarter();

      expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
      expect(screen.queryByTestId("property-pnl-skeleton")).not.toBeInTheDocument();
    });
  });
});
