import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BudgetBody, { type BudgetBodyProps } from "@/app/features/budget/BudgetBody";
import type { BudgetLine } from "@mybookkeeper/api-client/types/budget/budget-line";
import type { BudgetMonth } from "@mybookkeeper/api-client/types/budget/budget-month";
import { BUDGET_MESSAGES as MSG } from "@/shared/lib/budget-messages";

vi.mock("@mybookkeeper/api-client/store/budgetApi", () => ({
  useSetCategoryBudgetMutation: () => [vi.fn(), { isLoading: false }],
}));

function line(overrides: Partial<BudgetLine>): BudgetLine {
  return {
    spending_category_id: "c1", name: "Groceries", is_archived: false,
    budget_cents: 40_000, budget_effective_month: "2026-09", spent_cents: 21_950, refunded_cents: 0,
    remaining_cents: 18_050, percent_used: 55, is_over_budget: false, ...overrides,
  };
}

const GROCERIES = line({});
const DINING = line({
  spending_category_id: "c2", name: "Dining", budget_cents: 10_000, spent_cents: 10_150,
  refunded_cents: 3_050, remaining_cents: -150, percent_used: 102, is_over_budget: true,
});
const OLD = line({
  spending_category_id: "c3", name: "Gym", is_archived: true, budget_cents: null, budget_effective_month: null,
  spent_cents: 2_500, remaining_cents: null, percent_used: null,
});

const LOADED: BudgetMonth = {
  month: "2026-11", currency: "USD", lines: [GROCERIES, DINING, OLD], uncategorized_spent_cents: 4_200,
  totals: { budgeted_cents: 50_000, spent_cents: 38_800, remaining_cents: 11_200, percent_used: 78, is_over_budget: false },
};

function renderBody(overrides: Partial<BudgetBodyProps>) {
  const props: BudgetBodyProps = {
    data: LOADED, isLoading: false, isError: false, isRetrying: false, onRetry: vi.fn(), onAddCategory: vi.fn(), ...overrides,
  };
  render(<BudgetBody {...props} />);
  return props;
}

afterEach(cleanup);

describe("BudgetBody", () => {
  it("shows the skeleton while loading", () => {
    renderBody({ isLoading: true, data: undefined });
    expect(screen.getByTestId("budget-skeleton")).toBeInTheDocument();
    expect(screen.getAllByTestId("budget-skeleton-tile")).toHaveLength(3);
  });

  it("offers a retry when the month can't load", async () => {
    const props = renderBody({ isError: true, data: undefined });
    expect(screen.getByText(MSG.loadFailed)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it("sends someone with no categories to add one", async () => {
    const props = renderBody({ data: { ...LOADED, lines: [], uncategorized_spent_cents: 0 } });
    await userEvent.click(screen.getByRole("button", { name: MSG.emptyAction }));
    expect(props.onAddCategory).toHaveBeenCalled();
  });

  it("totals the month", () => {
    renderBody({});
    expect(screen.getByTestId("budget-total-budgeted")).toHaveTextContent("$500.00");
    expect(screen.getByTestId("budget-total-spent")).toHaveTextContent("$388.00");
    expect(screen.getByTestId("budget-total-left")).toHaveTextContent("$112.00");
  });

  it("shows a category under budget with what's left", () => {
    renderBody({});
    const row = within(screen.getByTestId("budget-line-c1"));
    expect(row.getByTestId("budget-line-amount")).toHaveTextContent("$219.50 of $400.00");
    expect(row.getByTestId("budget-line-status")).toHaveTextContent("$180.50 left");
    expect(row.getByTestId("budget-progress")).toHaveAttribute("data-over", "false");
  });

  it("marks a category over budget and names the refund taken off it", () => {
    renderBody({});
    const row = within(screen.getByTestId("budget-line-c2"));
    expect(row.getByTestId("budget-line-status")).toHaveTextContent("$1.50 over budget");
    expect(row.getByTestId("budget-line-status")).toHaveTextContent("includes $30.50 refunded");
    expect(row.getByTestId("budget-progress")).toHaveAttribute("data-over", "true");
    expect(row.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "102");
  });

  it("lists an archived category without a way to budget it", () => {
    renderBody({});
    const row = within(screen.getByTestId("budget-line-c3"));
    expect(row.getByText(MSG.archived)).toBeInTheDocument();
    expect(row.getByTestId("budget-line-status")).toHaveTextContent(MSG.noBudget);
    expect(row.queryByTestId("budget-edit")).not.toBeInTheDocument();
    expect(row.queryByTestId("budget-progress")).not.toBeInTheDocument();
  });

  it("shows uncategorized spending without a link, since there is no filter to land on", () => {
    renderBody({});
    const row = within(screen.getByTestId("budget-uncategorized"));
    expect(row.getByTestId("budget-uncategorized-amount")).toHaveTextContent("$42.00 spent");
    expect(row.queryByRole("link")).not.toBeInTheDocument();
  });

  it("hides the uncategorized line when there is none", () => {
    renderBody({ data: { ...LOADED, uncategorized_spent_cents: 0 } });
    expect(screen.queryByTestId("budget-uncategorized")).not.toBeInTheDocument();
  });

  it("opens the editor in place", async () => {
    renderBody({});
    await userEvent.click(within(screen.getByTestId("budget-line-c1")).getByTestId("budget-edit"));
    expect(screen.getByTestId("budget-editor")).toBeInTheDocument();
    expect(screen.getByTestId("budget-hint")).toHaveTextContent(MSG.appliesFrom("November 2026"));
  });

  it("says there are no budgets yet when none is set", () => {
    renderBody({
      data: { ...LOADED, totals: { budgeted_cents: null, spent_cents: 1_000, remaining_cents: null, percent_used: null, is_over_budget: false } },
    });
    expect(screen.getByTestId("budget-total-budgeted")).toHaveTextContent(MSG.noBudgetTotal);
    expect(screen.getByTestId("budget-total-left")).toHaveTextContent(MSG.noBudgetTotal);
  });
});
