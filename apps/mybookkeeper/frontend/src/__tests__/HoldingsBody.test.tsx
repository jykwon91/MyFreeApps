import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Holding } from "@mybookkeeper/api-client/types/investments/holding";
import type { HoldingList } from "@mybookkeeper/api-client/types/investments/holding-list";
import HoldingsBody, { type HoldingsBodyProps } from "@/app/features/holdings/HoldingsBody";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="bar-chart" data-points={data.length}>{children}</div>
  ),
  Bar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: ({ fill }: { fill: string }) => <span data-testid="bar-cell" data-fill={fill} />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "h1", financial_account_id: "a1", account_name: "Brokerage", is_manual: true, security_id: "s1",
    ticker_symbol: "VTI", name: "Vanguard Total Stock", security_type: "etf", quantity: "10.5000000000",
    price: "250.00000000", price_as_of: "2026-11-24", is_price_stale: false, value_cents: 262_500,
    cost_basis_cents: 200_000, gain_loss_cents: 62_500, gain_loss_percent: 31.25, currency: "USD",
    ...overrides,
  };
}

const LOADED: HoldingList = {
  financial_account_id: null,
  currency: "USD",
  holdings: [
    holding(),
    holding({
      id: "h2", ticker_symbol: "BND", name: null, security_type: "fixed_income", is_manual: false,
      account_name: "Fidelity IRA", value_cents: 50_000, cost_basis_cents: 60_000,
      gain_loss_cents: -10_000, gain_loss_percent: -16.67,
    }),
  ],
  totals: { value_cents: 312_500, cost_basis_cents: 260_000, gain_loss_cents: 52_500, gain_loss_percent: 20.19 },
  allocation: [
    { security_type: "etf", value_cents: 262_500, percent: 84 },
    { security_type: "fixed_income", value_cents: 50_000, percent: 16 },
  ],
};

function renderBody(overrides: Partial<HoldingsBodyProps> = {}) {
  const props: HoldingsBodyProps = {
    data: LOADED, isLoading: false, isError: false, isRetrying: false, onRetry: vi.fn(),
    canAddManually: true, onAdd: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn(), ...overrides,
  };
  render(<HoldingsBody {...props} />);
  return props;
}

afterEach(cleanup);

describe("HoldingsBody", () => {
  it("shows a skeleton shaped like the page while loading", () => {
    renderBody({ isLoading: true, data: undefined });
    expect(screen.getAllByTestId("holdings-skeleton-tile")).toHaveLength(3);
    expect(screen.getByTestId("holdings-skeleton-allocation")).toBeInTheDocument();
    expect(screen.getAllByTestId("holdings-skeleton-row").length).toBeGreaterThan(0);
  });

  it("offers a retry when it can't load", async () => {
    const props = renderBody({ isError: true, data: undefined });
    expect(screen.getByText(MSG.loadFailed)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it("totals the holdings and splits them by type, one color each", () => {
    renderBody();
    expect(screen.getByTestId("holdings-total-value")).toHaveTextContent("$3,125.00");
    expect(screen.getByTestId("holdings-total-cost-basis")).toHaveTextContent("$2,600.00");
    expect(screen.getByTestId("holdings-total-gain-loss")).toHaveTextContent("+$525.00 (+20.2%)");
    expect(screen.getByTestId("bar-chart")).toHaveAttribute("data-points", "2");
    const fills = screen.getAllByTestId("bar-cell").map((cell) => cell.getAttribute("data-fill"));
    expect(new Set(fills).size).toBe(2);
    expect(screen.getByTestId("holdings-allocation-list")).toHaveTextContent("ETF");
    expect(screen.getByTestId("holdings-allocation-list")).toHaveTextContent("84.0%");
  });

  it("lists each holding with its value, gain and loss, and names the account across all accounts", () => {
    renderBody();
    const row = within(screen.getByTestId("holding-row-h1"));
    expect(row.getByText("10.5")).toBeInTheDocument();
    expect(row.getByText("$250.00")).toBeInTheDocument();
    expect(row.getByTestId("holding-value")).toHaveTextContent("$2,625.00");
    expect(row.getByTestId("holding-gain-loss")).toHaveTextContent("+$625.00");
    expect(row.getByText("Brokerage")).toBeInTheDocument();
    const loss = within(screen.getByTestId("holding-row-h2")).getByTestId("holding-gain-loss");
    expect(loss).toHaveTextContent("-$100.00");
    expect(loss).toHaveTextContent("-16.7%");
  });

  it("has a phone card for every holding", () => {
    renderBody();
    expect(screen.getByTestId("holding-card-h1")).toBeInTheDocument();
    expect(screen.getByTestId("holding-card-h2")).toBeInTheDocument();
  });

  it("lets a hand-entered holding be edited and removed, and marks a synced one", async () => {
    const props = renderBody();
    const manual = within(screen.getByTestId("holding-row-h1"));
    await userEvent.click(manual.getByTestId("holding-edit"));
    expect(props.onEdit).toHaveBeenCalledWith(LOADED.holdings[0]);
    await userEvent.click(manual.getByTestId("holding-remove"));
    expect(props.onRemove).toHaveBeenCalledWith(LOADED.holdings[0]);
    const synced = within(screen.getByTestId("holding-row-h2"));
    expect(synced.queryByTestId("holding-edit")).not.toBeInTheDocument();
    expect(synced.getByText(MSG.syncedFromBank)).toBeInTheDocument();
  });

  it("flags an old price with its date and explains it once", () => {
    renderBody({
      data: { ...LOADED, holdings: [holding({ is_price_stale: true, price_as_of: "2026-11-01" })] },
    });
    expect(screen.getByTestId("holdings-stale-hint")).toHaveTextContent(MSG.staleHint);
    expect(within(screen.getByTestId("holding-row-h1")).getByTestId("holding-stale-price")).toHaveTextContent("Nov 1, 2026");
  });

  it("shows no stale hint when every price is fresh", () => {
    renderBody();
    expect(screen.queryByTestId("holdings-stale-hint")).not.toBeInTheDocument();
  });

  it("an empty manual account offers to add the first holding", async () => {
    const props = renderBody({ data: { ...LOADED, holdings: [], allocation: [] } });
    expect(screen.getByText(MSG.noHoldingsManual)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: MSG.addFirst }));
    expect(props.onAdd).toHaveBeenCalled();
  });

  it("an empty synced account says they come with the next sync", () => {
    renderBody({ data: { ...LOADED, holdings: [], allocation: [] }, canAddManually: false });
    expect(screen.getByText(MSG.noHoldingsSynced)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: MSG.addFirst })).not.toBeInTheDocument();
  });
});
