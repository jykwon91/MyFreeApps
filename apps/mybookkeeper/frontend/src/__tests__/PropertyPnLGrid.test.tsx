import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import PropertyPnLGrid from "@/app/features/attribution/PropertyPnLGrid";
import type { PropertyPnLResponse } from "@/shared/types/attribution/property-pnl";

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

vi.mock("@/shared/store/attributionApi", () => ({
  useGetPropertyPnlQuery: vi.fn(),
  useGetAttributionReviewQueueQuery: vi.fn(() => ({ data: undefined, isLoading: true })),
  useConfirmAttributionReviewMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useRejectAttributionReviewMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useAttributeTransactionManuallyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

import { useGetPropertyPnlQuery } from "@/shared/store/attributionApi";

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
      data: undefined,
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
      data: emptyPnl,
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
      data: pnlWithData,
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
      data: pnlWithData,
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
      data: pnlWithData,
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
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useGetPropertyPnlQuery>);

    const { container } = renderWithProviders(
      <PropertyPnLGrid since="2026-01-01" until="2026-03-31" />,
    );
    const skeletons = container.querySelectorAll(".animate-pulse");
    // 3 roll-up + 3 property = 6 skeleton items
    expect(skeletons.length).toBe(6);
  });
});
