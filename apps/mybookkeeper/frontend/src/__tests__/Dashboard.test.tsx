import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import Dashboard from "@/app/pages/Dashboard";
import type { SummaryResponse } from "@/shared/types/summary/summary";

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
  by_property_month: [],
};

const mockEmptySummary: SummaryResponse = {
  revenue: 0,
  expenses: 0,
  profit: 0,
  by_category: {},
  by_property: [],
  by_month: [],
  by_month_expense: [],
  by_property_month: [],
};

vi.mock("@/shared/store/summaryApi", () => ({
  useGetSummaryQuery: vi.fn(() => ({
    data: mockSummaryWithData,
    isLoading: false,
  })),
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

import { useGetSummaryQuery } from "@/shared/store/summaryApi";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetSummaryQuery).mockReturnValue({
      data: mockSummaryWithData,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetSummaryQuery>);
  });

  it("renders the Dashboard title", () => {
    renderWithProviders(<Dashboard />);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders all three summary cards", () => {
    renderWithProviders(<Dashboard />);

    const section = screen.getByText("Total Revenue").closest("section")!;
    expect(within(section).getByText("Total Revenue")).toBeInTheDocument();
    expect(within(section).getByText("Total Expenses")).toBeInTheDocument();
    expect(within(section).getByText("Net Profit")).toBeInTheDocument();
  });

  it("renders formatted amounts in summary cards", () => {
    renderWithProviders(<Dashboard />);

    const section = screen.getByText("Total Revenue").closest("section")!;
    expect(within(section).getByText("$5,000.00")).toBeInTheDocument();
    expect(within(section).getByText("$2,000.00")).toBeInTheDocument();
    expect(within(section).getByText("$3,000.00")).toBeInTheDocument();
  });

  it("renders property breakdown table when data exists", () => {
    renderWithProviders(<Dashboard />);

    expect(screen.getByText("By Property")).toBeInTheDocument();
    expect(screen.getByText("Beach House")).toBeInTheDocument();
  });

  it("renders monthly overview chart section when month data exists", () => {
    renderWithProviders(<Dashboard />);

    expect(screen.getByText("Monthly Overview")).toBeInTheDocument();
  });

  it("renders category chart when category data exists", () => {
    renderWithProviders(<Dashboard />);

    expect(screen.getByText("By Category")).toBeInTheDocument();
  });

  it("shows empty state CTA when no transactions", () => {
    vi.mocked(useGetSummaryQuery).mockReturnValue({
      data: mockEmptySummary,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetSummaryQuery>);

    renderWithProviders(<Dashboard />);

    expect(screen.getByText("No transactions yet.")).toBeInTheDocument();
    expect(screen.getByText(/Upload your first document/)).toBeInTheDocument();
    expect(screen.getByText("Go to Documents")).toBeInTheDocument();
  });

  it("hides category chart when no category data", () => {
    vi.mocked(useGetSummaryQuery).mockReturnValue({
      data: mockEmptySummary,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetSummaryQuery>);

    renderWithProviders(<Dashboard />);

    expect(screen.queryByText("By Category")).not.toBeInTheDocument();
  });

  it("shows skeleton when loading", () => {
    vi.mocked(useGetSummaryQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useGetSummaryQuery>);

    const { container } = renderWithProviders(<Dashboard />);

    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it("links to documents page from empty state", () => {
    vi.mocked(useGetSummaryQuery).mockReturnValue({
      data: mockEmptySummary,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetSummaryQuery>);

    renderWithProviders(<Dashboard />);

    const link = screen.getByText("Go to Documents");
    expect(link.closest("a")).toHaveAttribute("href", "/documents");
  });

  it("hides property breakdown table when no property data", () => {
    vi.mocked(useGetSummaryQuery).mockReturnValue({
      data: mockEmptySummary,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetSummaryQuery>);

    renderWithProviders(<Dashboard />);

    expect(screen.queryByText("By Property")).not.toBeInTheDocument();
  });
});
