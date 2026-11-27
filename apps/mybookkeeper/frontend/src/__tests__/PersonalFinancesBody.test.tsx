import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import PersonalFinancesBody, { type PersonalFinancesBodyProps } from "@/app/features/personal-finances/PersonalFinancesBody";
import type { PersonalFinances } from "@mybookkeeper/api-client/types/personal-finances/personal-finances";
import { PERSONAL_FINANCES_MESSAGES as MSG } from "@/shared/lib/personal-finances-messages";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="composed-chart" data-points={data.length}>{children}</div>
  ),
  Bar: ({ dataKey }: { dataKey: string }) => <span data-testid={`bar-${dataKey}`} />,
  Line: ({ dataKey }: { dataKey: string }) => <span data-testid={`line-${dataKey}`} />,
  ReferenceArea: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

const LOADED: PersonalFinances = {
  currency: "USD", bank_history_start: "2026-09-01", start: "2026-09", end: "2026-11", years: [2026],
  months: [
    { month: "2026-09", income_cents: 700_000, expenses_cents: 400_000, mortgages_loans_cents: 341_396, net_cents: 300_000 },
    { month: "2026-10", income_cents: 2_527_900, expenses_cents: 400_000, mortgages_loans_cents: 341_396, net_cents: 2_127_900 },
  ],
  totals: { income_cents: 3_227_900, expenses_cents: 800_000, mortgages_loans_cents: 682_792, net_cents: 2_427_900 },
  income_split: {
    salary_cents: 1_000_000, rental_cents: 380_000, rental_costs_cents: 400_000, rental_net_cents: -20_000,
    one_off_cents: 1_827_900, other_cents: 20_000,
  },
  by_category: [{ label: "Mortgage", cents: 682_792 }, { label: "Groceries", cents: 117_208 }],
  one_offs: [{ transaction_id: "t-1", date: "2026-10-20", payee: "Schwab beneficiary", amount_cents: 1_827_900 }],
  average: { months: 2, income_cents: 1_613_950, expenses_cents: 400_000, net_cents: 1_213_950, typical_income_cents: 700_000, typical_net_cents: 300_000 },
};

function renderBody(overrides: Partial<PersonalFinancesBodyProps>) {
  const props: PersonalFinancesBodyProps = {
    data: LOADED, isLoading: false, isError: false, isRetrying: false, onRetry: vi.fn(), onRangeSelect: vi.fn(), ...overrides,
  };
  render(<MemoryRouter><PersonalFinancesBody {...props} /></MemoryRouter>);
  return props;
}

afterEach(cleanup);

describe("PersonalFinancesBody", () => {
  it("shows the skeleton while loading", () => {
    renderBody({ isLoading: true, data: undefined });
    expect(screen.getByTestId("personal-finances-skeleton")).toBeInTheDocument();
  });

  it("offers a retry when the figures didn't load", async () => {
    const props = renderBody({ isError: true, data: undefined });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(props.onRetry).toHaveBeenCalled();
    expect(screen.getByText(MSG.loadFailed)).toBeInTheDocument();
  });

  it("asks for a bank connection when there is none", () => {
    renderBody({ data: { ...LOADED, bank_history_start: null } });
    expect(screen.getByTestId("personal-finances-no-bank")).toHaveTextContent(MSG.noBankTitle);
    expect(screen.getByRole("link", { name: MSG.noBankAction })).toHaveAttribute("href", "/financial-accounts");
    expect(screen.queryByTestId("personal-finances-tiles")).toBeNull();
  });

  it("shows the totals, the typical month and mortgages & loans inside expenses", () => {
    renderBody({});
    expect(screen.getByTestId("personal-finances-income")).toHaveTextContent("$32,279.00");
    expect(screen.getByTestId("personal-finances-expenses")).toHaveTextContent("$6,827.92 of it mortgages & loans");
    expect(screen.getByTestId("personal-finances-average")).toHaveTextContent("$3,000.00 in a typical month, without one-offs");
    expect(screen.getByTestId("bar-mortgagesLoans")).toBeInTheDocument();
    expect(screen.getByTestId("line-net")).toBeInTheDocument();
  });

  it("splits income into salary, rent, one-offs and other, each a share of the total", () => {
    renderBody({});
    expect(screen.getByTestId("personal-finances-income-salary")).toHaveTextContent("$10,000.00");
    expect(screen.getByTestId("personal-finances-income-one-off")).toHaveTextContent("$18,279.00");
    expect(screen.getByTestId("personal-finances-income-other")).toHaveTextContent("$200.00");
    const rental = screen.getByTestId("personal-finances-income-rental");
    expect(rental).toHaveTextContent("$3,800.00");
    expect(rental.querySelector("[style]")).not.toHaveStyle({ width: "0%" });
  });

  it("rentals that cost more than they brought in net below zero, in red, under rent", () => {
    renderBody({});
    const net = screen.getByTestId("personal-finances-rental-net");
    expect(net).toHaveTextContent("-$200.00 after $4,000.00 of rental costs");
    expect(net).toHaveClass("text-red-600");
  });

  it("lists the one-offs, and hides the section when there are none", () => {
    renderBody({});
    expect(within(screen.getByTestId("personal-finances-one-offs")).getByText("Schwab beneficiary")).toBeInTheDocument();
    cleanup();
    renderBody({ data: { ...LOADED, one_offs: [] } });
    expect(screen.queryByTestId("personal-finances-one-offs")).toBeNull();
  });

  it("a net below zero shows in red", () => {
    renderBody({ data: { ...LOADED, totals: { ...LOADED.totals, net_cents: -50_000 } } });
    expect(screen.getByTestId("personal-finances-net").querySelector("p.text-red-600")).toHaveTextContent("-$500.00");
  });

  it("says when nothing moved instead of drawing an empty chart", () => {
    renderBody({ data: { ...LOADED, totals: { income_cents: 0, expenses_cents: 0, mortgages_loans_cents: 0, net_cents: 0 } } });
    expect(screen.getByText(MSG.empty)).toBeInTheDocument();
    expect(screen.queryByTestId("personal-finances-chart")).toBeNull();
  });
});
