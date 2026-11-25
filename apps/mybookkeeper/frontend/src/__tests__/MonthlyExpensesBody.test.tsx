import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MonthlyExpensesBody, { type MonthlyExpensesBodyProps } from "@/app/features/monthly-expenses/MonthlyExpensesBody";
import type { MonthlyExpenses } from "@mybookkeeper/api-client/types/monthly-expenses/monthly-expenses";
import { MONTHLY_EXPENSES_MESSAGES as MSG } from "@/shared/lib/monthly-expenses-messages";
import { MONTHLY_EXPENSE_SKELETON_CATEGORIES } from "@/shared/lib/monthly-expenses-pages";

vi.mock("@/app/features/monthly-expenses/MonthlyExpenseCategoryDetail", () => ({
  default: ({ label }: { label: string }) => <div data-testid="detail">{label}</div>,
}));

const LOADED: MonthlyExpenses = {
  range: "3m", scope: "all", currency: "USD",
  months: [
    { month: "2026-08", total_cents: 1_500_00 },
    { month: "2026-09", total_cents: 0 },
    { month: "2026-10", total_cents: 1_500_00 },
  ],
  total_cents: 3_000_00,
  average_cents: 1_000_00,
  categories: [
    { label: "Mortgage", total_cents: 2_400_00, average_cents: 800_00, share_percent: 80 },
    { label: "Groceries", total_cents: 600_00, average_cents: 200_00, share_percent: 20 },
  ],
};

function renderBody(overrides: Partial<MonthlyExpensesBodyProps>) {
  const props: MonthlyExpensesBodyProps = {
    data: LOADED, query: { range: "3m", scope: "all" },
    isLoading: false, isError: false, isRetrying: false, onRetry: vi.fn(), ...overrides,
  };
  render(<MonthlyExpensesBody {...props} />);
  return props;
}

afterEach(cleanup);

describe("MonthlyExpensesBody", () => {
  it("shows a skeleton with the loaded view's shape, one row per month in the range", () => {
    renderBody({ isLoading: true, data: undefined, query: { range: "12m", scope: "all" } });
    expect(screen.getAllByTestId("monthly-expenses-skeleton-tile")).toHaveLength(2);
    expect(screen.getAllByTestId("monthly-expenses-skeleton-category")).toHaveLength(MONTHLY_EXPENSE_SKELETON_CATEGORIES);
    expect(screen.getAllByTestId("monthly-expenses-skeleton-month")).toHaveLength(12);
  });

  it("offers a retry when it can't load", async () => {
    const props = renderBody({ isError: true, data: undefined });
    expect(screen.getByText(MSG.loadFailed)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it("shows the average, the total, each heading and each month", () => {
    renderBody({});
    expect(screen.getByTestId("monthly-expenses-average")).toHaveTextContent("$1,000.00");
    expect(screen.getByTestId("monthly-expenses-total")).toHaveTextContent(MSG.totalOver(3));
    expect(screen.getByTestId("monthly-expenses-total")).toHaveTextContent("$3,000.00");
    const labels = screen.getAllByTestId("monthly-expense-category-label").map((el) => el.textContent);
    expect(labels).toEqual(["Mortgage", "Groceries"]);
    expect(screen.getAllByTestId("monthly-expenses-month")).toHaveLength(3);
    expect(screen.getAllByTestId("monthly-expenses-month")[1]).toHaveTextContent("September 2026");
  });

  it("opens a heading to its payments and closes it again", async () => {
    renderBody({});
    const [mortgage] = screen.getAllByTestId("monthly-expense-category");
    const toggle = within(mortgage).getByTestId("monthly-expense-category-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(mortgage).getByTestId("detail")).toHaveTextContent("Mortgage");
    await userEvent.click(toggle);
    expect(screen.queryByTestId("detail")).not.toBeInTheDocument();
  });

  it("says so when nothing was spent", () => {
    renderBody({ data: { ...LOADED, categories: [], total_cents: 0, average_cents: 0 } });
    expect(screen.getByText(MSG.empty)).toBeInTheDocument();
  });
});
