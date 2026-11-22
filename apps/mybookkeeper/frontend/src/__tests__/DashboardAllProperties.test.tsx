import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import Dashboard from "@/app/pages/Dashboard";
import type { SummaryResponse } from "@mybookkeeper/api-client/types/summary/summary";

const mockSummaryWithData: SummaryResponse = {
  revenue: 5000,
  expenses: 2000,
  profit: 3000,
  by_category: { repairs: 800, insurance: 1200 },
  by_property: [
    {
      property_id: "prop-1",
      name: "Beach House",
      revenue: 5000,
      expenses: 2000,
      profit: 3000,
    },
  ],
  by_month: [
    { month: "2025-01", revenue: 2500, expenses: 1000, profit: 1500 },
    { month: "2025-02", revenue: 2500, expenses: 1000, profit: 1500 },
  ],
  by_month_expense: [
    { month: "2025-01", maintenance: 1000 },
    { month: "2025-02", maintenance: 1000 },
  ],
  by_month_revenue: [
    { month: "2025-01", rental_revenue: 2500 },
    { month: "2025-02", rental_revenue: 2500 },
  ],
  by_property_month: [],
};

vi.mock("@mybookkeeper/api-client/store/summaryApi", () => ({
  useGetSummaryQuery: vi.fn(() => ({
    currentData: mockSummaryWithData,
    isLoading: false,
  })),
  useGetSummaryYearsQuery: vi.fn(() => ({
    data: [2025],
    isLoading: false,
  })),
}));

vi.mock("@mybookkeeper/api-client/store/attributionApi", () => ({
  useGetPropertyPnlQuery: vi.fn(() => ({
    currentData: {
      since: "2026-05-01",
      until: "2026-05-31",
      properties: [],
      total_revenue_cents: 0,
      total_expenses_cents: 0,
      total_net_cents: 0,
    },
    isLoading: false,
  })),
  useGetAttributionReviewQueueQuery: vi.fn(() => ({
    data: { items: [], total: 0, pending_count: 0 },
    isLoading: false,
  })),
  useConfirmAttributionReviewMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useRejectAttributionReviewMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useAttributeTransactionManuallyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div data-testid="composed-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  ReferenceArea: () => <div data-testid="reference-area" />,
}));

vi.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({
    data: [
      { id: "p1", name: "Property A", address: null, classification: "investment", type: "short_term", is_active: true, activity_periods: [], created_at: "2025-01-01" },
      { id: "p2", name: "Property B", address: null, classification: "investment", type: "short_term", is_active: true, activity_periods: [], created_at: "2025-01-01" },
    ],
    isLoading: false,
  })),
}));

import { useGetSummaryQuery } from "@mybookkeeper/api-client/store/summaryApi";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}

function lastSummaryParams(): { propertyIds?: string[] } {
  const { calls } = vi.mocked(useGetSummaryQuery).mock;
  return calls[calls.length - 1][0] as { propertyIds?: string[] };
}

async function tickProperty(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Filter by property" }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name }));
  await user.keyboard("{Escape}");
}

describe("Dashboard property filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("narrows the totals to a subset of the properties", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Dashboard />);
    await tickProperty(user, "Property A");
    expect(lastSummaryParams().propertyIds).toEqual(["p1"]);
  });

  it("asks for the totals with no property filter when every property is ticked, as the list behind them does", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Dashboard />);
    await tickProperty(user, "Property A");
    await tickProperty(user, "Property B");
    expect(screen.getByTestId("property-filter-trigger")).toHaveTextContent("2 properties");
    expect(lastSummaryParams().propertyIds).toBeUndefined();
  });
});
