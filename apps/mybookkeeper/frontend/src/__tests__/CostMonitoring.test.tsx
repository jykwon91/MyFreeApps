import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import CostMonitoring from "@/admin/pages/CostMonitoring";
import type { CostSummary, UserCost, DailyCost, CostThresholds } from "@/shared/types/admin/cost";

const mockSummary: CostSummary = {
  today: 12.50,
  this_week: 48.25,
  this_month: 210.75,
  total_tokens_today: 500000,
  extractions_today: 30,
};

const mockThresholds: CostThresholds = {
  daily_budget: 50,
  monthly_budget: 1000,
  per_user_daily_alert: 10,
  input_rate_per_million: 3,
  output_rate_per_million: 15,
};

const mockUsers: UserCost[] = [
  { user_id: "u1", email: "alice@example.com", cost: 5.25, tokens: 120000, extractions: 10 },
  { user_id: "u2", email: "bob@example.com", cost: 15.00, tokens: 300000, extractions: 20 },
];

const mockTimeline: DailyCost[] = [
  { date: "2024-03-01", cost: 8.50, input_cost: 3.50, output_cost: 5.00, tokens: 200000, extractions: 15 },
  { date: "2024-03-02", cost: 4.00, input_cost: 1.50, output_cost: 2.50, tokens: 100000, extractions: 8 },
];

vi.mock("@/shared/store/costsApi", () => ({
  useGetCostSummaryQuery: vi.fn(() => ({ data: mockSummary, isLoading: false, isError: false })),
  useGetCostByUserQuery: vi.fn(() => ({ data: mockUsers, isError: false })),
  useGetCostTimelineQuery: vi.fn(() => ({ data: mockTimeline, isError: false })),
  useGetCostThresholdsQuery: vi.fn(() => ({ data: mockThresholds })),
  useUpdateCostThresholdsMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useGetSmtpStatusQuery: vi.fn(() => ({ data: null })),
  useTestSmtpMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/hooks/useToast", () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  ReferenceLine: () => <div data-testid="reference-line" />,
}));



import {
  useGetCostSummaryQuery,
  useGetCostByUserQuery,
  useGetCostTimelineQuery,
} from "@/shared/store/costsApi";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}

describe("CostMonitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetCostSummaryQuery).mockReturnValue({
      data: mockSummary,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useGetCostSummaryQuery>);
    vi.mocked(useGetCostByUserQuery).mockReturnValue({
      data: mockUsers,
      isError: false,
    } as unknown as ReturnType<typeof useGetCostByUserQuery>);
    vi.mocked(useGetCostTimelineQuery).mockReturnValue({
      data: mockTimeline,
      isError: false,
    } as unknown as ReturnType<typeof useGetCostTimelineQuery>);
  });

  it("renders the Cost Monitoring title", () => {
    renderWithProviders(<CostMonitoring />);
    expect(screen.getByText("Cost Monitoring")).toBeInTheDocument();
  });

  it("renders subtitle with configured rates", () => {
    renderWithProviders(<CostMonitoring />);
    expect(screen.getByText(/Rates:/)).toBeInTheDocument();
    expect(screen.getByText(/\$3\/M input/)).toBeInTheDocument();
    expect(screen.getByText(/\$15\/M output/)).toBeInTheDocument();
  });

  it("renders Today, This Week, and This Month cost cards", () => {
    renderWithProviders(<CostMonitoring />);
    expect(screen.getAllByText("Today").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("This Week").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("This Month").length).toBeGreaterThanOrEqual(1);
  });

  it("renders formatted cost values on summary cards", () => {
    renderWithProviders(<CostMonitoring />);
    expect(screen.getByText("$12.50")).toBeInTheDocument();
    expect(screen.getByText("$48.25")).toBeInTheDocument();
    expect(screen.getByText("$210.75")).toBeInTheDocument();
  });

  it("renders token count and extraction count on Today card", () => {
    renderWithProviders(<CostMonitoring />);
    expect(screen.getByText(/500K tokens/)).toBeInTheDocument();
    expect(screen.getByText(/30 extractions/)).toBeInTheDocument();
  });

  it("renders budget percentage for Today card", () => {
    renderWithProviders(<CostMonitoring />);
    expect(screen.getByText(/25% of budget/)).toBeInTheDocument();
  });

  it("renders user cost table with email, extractions, tokens and cost", () => {
    renderWithProviders(<CostMonitoring />);
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.getByText("$5.25")).toBeInTheDocument();
    expect(screen.getByText("$15.00")).toBeInTheDocument();
  });

  it("renders user cost table column headers", () => {
    renderWithProviders(<CostMonitoring />);
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("Extractions")).toBeInTheDocument();
    expect(screen.getByText("Tokens")).toBeInTheDocument();
    expect(screen.getByText("Cost")).toBeInTheDocument();
  });

  it("renders the Daily Cost chart section heading", () => {
    renderWithProviders(<CostMonitoring />);
    expect(screen.getByText("Daily Cost (Last 30 Days)")).toBeInTheDocument();
  });

  it("renders the Cost by User section heading", () => {
    renderWithProviders(<CostMonitoring />);
    expect(screen.getByText("Cost by User")).toBeInTheDocument();
  });

  it("renders the period filter dropdown", () => {
    renderWithProviders(<CostMonitoring />);
    expect(screen.getByRole("combobox", { name: "Period" })).toBeInTheDocument();
  });

  it("period filter dropdown has Today, This Week, This Month options", () => {
    renderWithProviders(<CostMonitoring />);
    const select = screen.getByRole("combobox", { name: "Period" });
    expect(select).toHaveValue("today");
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toContain("Today");
    expect(options).toContain("This Week");
    expect(options).toContain("This Month");
  });

  it("changing the period filter updates the selected value", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CostMonitoring />);
    const select = screen.getByRole("combobox", { name: "Period" });
    await user.selectOptions(select, "week");
    expect(select).toHaveValue("week");
  });

  it("renders the alert threshold settings button", () => {
    renderWithProviders(<CostMonitoring />);
    expect(screen.getByRole("button", { name: "Alert threshold settings" })).toBeInTheDocument();
  });

  it("opens threshold settings modal when settings button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CostMonitoring />);
    await user.click(screen.getByRole("button", { name: "Alert threshold settings" }));
    expect(screen.getByText("Alert Thresholds")).toBeInTheDocument();
  });

  it("shows skeleton when summary is loading", () => {
    vi.mocked(useGetCostSummaryQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useGetCostSummaryQuery>);
    const { container } = renderWithProviders(<CostMonitoring />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows error message when summary query fails", () => {
    vi.mocked(useGetCostSummaryQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useGetCostSummaryQuery>);
    renderWithProviders(<CostMonitoring />);
    expect(screen.getByText(/Couldn't load cost data right now/)).toBeInTheDocument();
  });

  it("shows no usage data message when user list is empty", () => {
    vi.mocked(useGetCostByUserQuery).mockReturnValue({
      data: [],
      isError: false,
    } as unknown as ReturnType<typeof useGetCostByUserQuery>);
    renderWithProviders(<CostMonitoring />);
    expect(screen.getByText("No usage data for this period")).toBeInTheDocument();
  });

  it("shows timeline error message when timeline query fails", () => {
    vi.mocked(useGetCostTimelineQuery).mockReturnValue({
      data: undefined,
      isError: true,
    } as unknown as ReturnType<typeof useGetCostTimelineQuery>);
    renderWithProviders(<CostMonitoring />);
    expect(screen.getByText("Couldn't load timeline data")).toBeInTheDocument();
  });

  it("shows no cost data message when timeline is empty", () => {
    vi.mocked(useGetCostTimelineQuery).mockReturnValue({
      data: [],
      isError: false,
    } as unknown as ReturnType<typeof useGetCostTimelineQuery>);
    renderWithProviders(<CostMonitoring />);
    expect(screen.getByText("No cost data recorded in the last 30 days")).toBeInTheDocument();
  });

  it("shows user cost error message when user cost query fails", () => {
    vi.mocked(useGetCostByUserQuery).mockReturnValue({
      data: undefined,
      isError: true,
    } as unknown as ReturnType<typeof useGetCostByUserQuery>);
    renderWithProviders(<CostMonitoring />);
    expect(screen.getByText("Couldn't load user cost data")).toBeInTheDocument();
  });
});
