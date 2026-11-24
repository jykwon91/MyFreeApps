import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError, showSuccess } from "@platform/ui";
import BudgetAmountEditor from "@/app/features/budget/BudgetAmountEditor";
import type { BudgetLine } from "@mybookkeeper/api-client/types/budget/budget-line";
import { MONEY_INPUT_MESSAGES } from "@mybookkeeper/api-client/constants/moneyInput";
import { BUDGET_MESSAGES as MSG } from "@/shared/lib/budget-messages";

const setBudget = vi.fn();
vi.mock("@mybookkeeper/api-client/store/budgetApi", () => ({
  useSetCategoryBudgetMutation: () => [setBudget, { isLoading: false }],
}));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const GROCERIES: BudgetLine = {
  spending_category_id: "c1", name: "Groceries", is_archived: false,
  budget_cents: null, budget_effective_month: null, spent_cents: 21_950, refunded_cents: 0,
  remaining_cents: null, percent_used: null, is_over_budget: false,
};

beforeEach(() => {
  setBudget.mockReset();
  vi.mocked(showError).mockReset();
  vi.mocked(showSuccess).mockReset();
});
afterEach(cleanup);

describe("BudgetAmountEditor", () => {
  it("says the change holds from the month on screen onward", () => {
    render(<BudgetAmountEditor line={GROCERIES} month="2026-11" onDone={vi.fn()} />);
    expect(screen.getByTestId("budget-hint")).toHaveTextContent(MSG.appliesFrom("November 2026"));
    expect(screen.queryByTestId("budget-remove")).not.toBeInTheDocument();
  });

  it("refuses a blank amount and sends nothing", async () => {
    render(<BudgetAmountEditor line={GROCERIES} month="2026-11" onDone={vi.fn()} />);
    await userEvent.click(screen.getByTestId("budget-save"));
    expect(screen.getByTestId("budget-hint")).toHaveTextContent(MONEY_INPUT_MESSAGES.notPositive);
    expect(setBudget).not.toHaveBeenCalled();
  });

  it("saves dollars as cents from the month on screen, confirms and closes", async () => {
    setBudget.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    const onDone = vi.fn();
    render(<BudgetAmountEditor line={GROCERIES} month="2026-11" onDone={onDone} />);
    await userEvent.type(screen.getByTestId("budget-input"), "$400.50");
    await userEvent.click(screen.getByTestId("budget-save"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(setBudget).toHaveBeenCalledWith({ categoryId: "c1", data: { effective_month: "2026-11", amount_cents: 40_050 } });
    expect(showSuccess).toHaveBeenCalledWith(MSG.saved);
  });

  it("shows the button busy while saving", async () => {
    setBudget.mockReturnValue({ unwrap: () => new Promise(() => {}) });
    render(<BudgetAmountEditor line={{ ...GROCERIES, budget_cents: 40_000 }} month="2026-11" onDone={vi.fn()} />);
    await userEvent.click(screen.getByTestId("budget-save"));
    expect(screen.getByTestId("budget-save")).toHaveTextContent(MSG.saving);
    expect(screen.getByTestId("budget-remove")).toBeDisabled();
  });

  it("removes a budget from this month on", async () => {
    setBudget.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    const onDone = vi.fn();
    render(<BudgetAmountEditor line={{ ...GROCERIES, budget_cents: 40_000 }} month="2026-12" onDone={onDone} />);
    expect(screen.getByTestId("budget-input")).toHaveValue("400");
    await userEvent.click(screen.getByTestId("budget-remove"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(setBudget).toHaveBeenCalledWith({ categoryId: "c1", data: { effective_month: "2026-12", amount_cents: null } });
    expect(showSuccess).toHaveBeenCalledWith(MSG.removed);
  });

  it("keeps the editor open and says so when the save fails", async () => {
    setBudget.mockReturnValue({ unwrap: () => Promise.reject({ status: 500, data: {} }) });
    const onDone = vi.fn();
    render(<BudgetAmountEditor line={GROCERIES} month="2026-11" onDone={onDone} />);
    await userEvent.type(screen.getByTestId("budget-input"), "50");
    await userEvent.click(screen.getByTestId("budget-save"));
    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId("budget-save")).not.toBeDisabled();
  });
});
