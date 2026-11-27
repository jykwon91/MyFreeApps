import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CashFlowBody, { type CashFlowBodyProps } from "@/app/features/cash-flow/CashFlowBody";
import type { CashFlow } from "@mybookkeeper/api-client/types/cash-flow/cash-flow";
import { CASH_FLOW_MESSAGES as MSG } from "@/shared/lib/cash-flow-messages";
import { CASH_BASIS_MESSAGES } from "@/shared/lib/cash-basis-messages";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="composed-chart" data-points={data.length}>{children}</div>
  ),
  Bar: ({ dataKey }: { dataKey: string }) => <span data-testid={`bar-${dataKey}`} />,
  Line: ({ dataKey }: { dataKey: string }) => <span data-testid={`line-${dataKey}`} />,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

const LOADED: CashFlow = {
  range: "6m", scope: "all", account_id: null, currency: "USD", bank_history_start: "2024-11-27",
  months: [
    { month: "2026-10", money_in_cents: 500_000, money_out_cents: 320_000, net_cents: 180_000 },
    { month: "2026-11", money_in_cents: 0, money_out_cents: 10_000, net_cents: -10_000 },
  ],
  totals: { money_in_cents: 500_000, money_out_cents: 330_000, net_cents: 170_000 },
};

function renderBody(overrides: Partial<CashFlowBodyProps>) {
  const props: CashFlowBodyProps = { data: LOADED, isLoading: false, isError: false, isRetrying: false, onRetry: vi.fn(), ...overrides };
  render(<CashFlowBody {...props} />);
  return props;
}

afterEach(cleanup);

describe("CashFlowBody", () => {
  it("shows a skeleton with the chart's height while loading", () => {
    renderBody({ isLoading: true, data: undefined });
    expect(screen.getByTestId("cash-basis-note-skeleton")).toBeInTheDocument();
    expect(screen.getAllByTestId("cash-flow-skeleton-tile")).toHaveLength(3);
    expect(screen.getByTestId("cash-flow-skeleton-chart")).toBeInTheDocument();
  });

  it("offers a retry when it can't load", async () => {
    const props = renderBody({ isError: true, data: undefined });
    expect(screen.getByText(MSG.loadFailed)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it("totals the range and charts every month with in, out and net", () => {
    renderBody({});
    expect(screen.getByTestId("cash-flow-total-in")).toHaveTextContent("$5,000.00");
    expect(screen.getByTestId("cash-flow-total-out")).toHaveTextContent("$3,300.00");
    expect(screen.getByTestId("cash-flow-total-net")).toHaveTextContent("$1,700.00");
    expect(screen.getByTestId("composed-chart")).toHaveAttribute("data-points", "2");
    expect(screen.getByTestId("bar-moneyIn")).toBeInTheDocument();
    expect(screen.getByTestId("bar-moneyOut")).toBeInTheDocument();
    expect(screen.getByTestId("line-net")).toBeInTheDocument();
  });

  it("says it counts money through the accounts from the bank history start", () => {
    renderBody({});
    expect(screen.getByTestId("cash-basis-note")).toHaveTextContent(
      CASH_BASIS_MESSAGES.fromBankHistory("Nov 27, 2024"),
    );
  });

  it("says it counts every entry when no bank is connected", () => {
    renderBody({ data: { ...LOADED, bank_history_start: null } });
    expect(screen.getByTestId("cash-basis-note")).toHaveTextContent(CASH_BASIS_MESSAGES.noBankHistory);
  });

  it("says so instead of drawing an empty chart", () => {
    renderBody({
      data: {
        ...LOADED,
        months: LOADED.months.map((m) => ({ ...m, money_in_cents: 0, money_out_cents: 0, net_cents: 0 })),
        totals: { money_in_cents: 0, money_out_cents: 0, net_cents: 0 },
      },
    });
    expect(screen.getByText(MSG.empty)).toBeInTheDocument();
    expect(screen.queryByTestId("cash-flow-chart")).not.toBeInTheDocument();
  });
});
