import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import NetWorthBody, { type NetWorthBodyProps } from "@/app/features/net-worth/NetWorthBody";
import type { NetWorth } from "@mybookkeeper/api-client/types/net-worth/net-worth";
import type { NetWorthHistory } from "@mybookkeeper/api-client/types/net-worth/net-worth-history";
import type { NetWorthLine } from "@mybookkeeper/api-client/types/net-worth/net-worth-line";
import { NET_WORTH_MESSAGES as MSG } from "@/shared/lib/net-worth-messages";

const history = vi.fn();
vi.mock("@mybookkeeper/api-client/store/netWorthApi", () => ({
  useGetNetWorthHistoryQuery: (range: string) => history(range),
  useSetPropertyEstimatedValueMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="area-chart" data-points={data.length}>{children}</div>
  ),
  Area: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

function line(overrides: Partial<NetWorthLine>): NetWorthLine {
  return {
    source: "account", id: "a1", name: "Chase Checking", detail: "Chase", amount_cents: 250_000,
    currency: "USD", as_of: "2026-11-24", is_stale: false, in_total: true, ...overrides,
  };
}

const CHECKING = line({});
const OLD_SAVINGS = line({ id: "a2", name: "Old Savings", amount_cents: 1_000, as_of: "2026-08-01", is_stale: true });
const HOUSE = line({ source: "property", id: "p1", name: "Elm St", detail: "1 Elm St", amount_cents: null, as_of: null, in_total: false });
const LOAN = line({ source: "mortgage", id: "m1", name: "Rocket", detail: "Elm St", amount_cents: 200_000, as_of: "2026-06-01", is_stale: true });

const LOADED: NetWorth = {
  currency: "USD", as_of: "2026-11-24", assets_cents: 251_000, liabilities_cents: 200_000, net_cents: 51_000,
  groups: [
    { key: "cash", classification: "asset", total_cents: 251_000, lines: [CHECKING, OLD_SAVINGS] },
    { key: "property", classification: "asset", total_cents: 0, lines: [HOUSE] },
    { key: "loans", classification: "liability", total_cents: 200_000, lines: [LOAN] },
  ],
};

function historyOf(days: number): { data: NetWorthHistory; isLoading: false; isSuccess: true; isError: false; isFetching: false } {
  const points = Array.from({ length: days }, (_, i) => ({
    day: `2026-11-${String(24 - days + 1 + i).padStart(2, "0")}`, assets_cents: 1, liabilities_cents: 0, net_cents: 1,
  }));
  return { data: { range: "3m", currency: "USD", points }, isLoading: false, isSuccess: true, isError: false, isFetching: false };
}

function renderBody(overrides: Partial<NetWorthBodyProps> = {}) {
  const handlers = { onRetry: vi.fn(), onAddAccount: vi.fn() };
  render(
    <MemoryRouter>
      <NetWorthBody data={LOADED} isLoading={false} isError={false} isRetrying={false} {...handlers} {...overrides} />
    </MemoryRouter>,
  );
  return handlers;
}

beforeEach(() => {
  history.mockReset();
  history.mockReturnValue(historyOf(5));
});
afterEach(cleanup);

describe("NetWorthBody", () => {
  it("shows the skeleton while it loads, and nothing else", () => {
    renderBody({ data: undefined, isLoading: true });
    expect(screen.getByTestId("net-worth-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("net-worth-headline")).not.toBeInTheDocument();
    expect(history).not.toHaveBeenCalled();
  });

  it("says it couldn't load and retries on request", async () => {
    const { onRetry } = renderBody({ data: undefined, isError: true });
    expect(screen.getByText(MSG.loadFailed)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("sends someone with nothing to count to add an account", async () => {
    const { onAddAccount } = renderBody({ data: { ...LOADED, groups: [] } });
    await userEvent.click(screen.getByRole("button", { name: MSG.emptyAction }));
    expect(onAddAccount).toHaveBeenCalled();
  });

  it("leads with the total, then what you have and owe, then each group", () => {
    renderBody();
    expect(screen.getByTestId("net-worth-total")).toHaveTextContent("$510.00");
    expect(screen.getByTestId("net-worth-assets")).toHaveTextContent("$2,510.00");
    expect(screen.getByTestId("net-worth-liabilities")).toHaveTextContent("$2,000.00");
    const groups = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(groups).toEqual([MSG.historyTitle, "Cash", "Property", "Loans & mortgages"]);
    expect(within(screen.getByTestId("net-worth-group-cash")).getByTestId("net-worth-group-total")).toHaveTextContent("$2,510.00");
  });

  it("flags an out-of-date balance and links to where it's updated", () => {
    renderBody();
    const old = screen.getByTestId("net-worth-line-a2");
    expect(within(old).getByTestId("net-worth-line-note")).toHaveTextContent("Last updated Aug 1, 2026");
    expect(within(old).getByTestId("net-worth-update-link")).toHaveAttribute("href", "/financial-accounts");
    expect(within(screen.getByTestId("net-worth-line-m1")).getByTestId("net-worth-update-link")).toHaveAttribute("href", "/mortgages");
    expect(within(screen.getByTestId("net-worth-line-a1")).queryByTestId("net-worth-update-link")).not.toBeInTheDocument();
  });

  it("asks for a property's value instead of guessing one", () => {
    renderBody();
    const house = screen.getByTestId("net-worth-line-p1");
    expect(within(house).getByTestId("net-worth-line-amount")).toHaveTextContent("—");
    expect(within(house).getByTestId("net-worth-line-note")).toHaveTextContent(MSG.noValue);
    expect(within(house).getByTestId("net-worth-edit-value")).toHaveTextContent(MSG.addValue);
  });

  it("draws the chart for the picked range and refetches on a new one", async () => {
    renderBody();
    expect(history).toHaveBeenLastCalledWith("3m");
    expect(screen.getByTestId("area-chart")).toHaveAttribute("data-points", "5");
    expect(screen.getByTestId("net-worth-range-3m")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByTestId("net-worth-range-1y"));
    expect(history).toHaveBeenLastCalledWith("1y");
    expect(screen.getByTestId("net-worth-range-1y")).toHaveAttribute("aria-pressed", "true");
  });

  it("explains a chart with only today on it", () => {
    history.mockReturnValue(historyOf(1));
    renderBody();
    expect(screen.getByTestId("net-worth-history-empty")).toHaveTextContent(MSG.historyEmpty);
    expect(screen.queryByTestId("area-chart")).not.toBeInTheDocument();
  });

  it("shows a chart-sized skeleton while the history loads", () => {
    history.mockReturnValue({ data: undefined, isLoading: true, isSuccess: false, isError: false, isFetching: true });
    renderBody();
    expect(screen.getByTestId("net-worth-chart-skeleton")).toBeInTheDocument();
  });
});
