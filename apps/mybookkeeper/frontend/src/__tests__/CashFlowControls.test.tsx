import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CashFlowControls from "@/app/features/cash-flow/CashFlowControls";
import type { CashFlowQuery } from "@mybookkeeper/api-client/types/cash-flow/cash-flow-query";

const accounts = vi.fn();
vi.mock("@mybookkeeper/api-client/store/financialAccountsApi", () => ({
  useListFinancialAccountsQuery: () => accounts(),
}));

const DEFAULT: CashFlowQuery = { range: "6m", scope: "all", accountId: null };

beforeEach(() => {
  accounts.mockReturnValue({ data: { items: [{ id: "a1", name: "Chase Checking" }, { id: "a2", name: "Amex" }] } });
});
afterEach(cleanup);

describe("CashFlowControls", () => {
  it("marks the picked range and scope as pressed", () => {
    render(<CashFlowControls value={{ ...DEFAULT, scope: "rental" }} onChange={vi.fn()} />);
    expect(screen.getByTestId("cash-flow-range-6m")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("cash-flow-scope-rental")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("cash-flow-scope-all")).toHaveAttribute("aria-pressed", "false");
  });

  it("changes the scope and range, keeping the rest", async () => {
    const onChange = vi.fn();
    render(<CashFlowControls value={{ ...DEFAULT, accountId: "a1" }} onChange={onChange} />);
    await userEvent.click(screen.getByTestId("cash-flow-scope-personal"));
    expect(onChange).toHaveBeenLastCalledWith({ range: "6m", scope: "personal", accountId: "a1" });
    await userEvent.click(screen.getByTestId("cash-flow-range-ytd"));
    expect(onChange).toHaveBeenLastCalledWith({ range: "ytd", scope: "all", accountId: "a1" });
  });

  it("narrows to one account and back to all", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<CashFlowControls value={DEFAULT} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByTestId("cash-flow-account"), "a2");
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT, accountId: "a2" });
    rerender(<CashFlowControls value={{ ...DEFAULT, accountId: "a2" }} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByTestId("cash-flow-account"), "");
    expect(onChange).toHaveBeenLastCalledWith(DEFAULT);
  });

  it("leaves out the account picker when there are no accounts", () => {
    accounts.mockReturnValue({ data: { items: [] } });
    render(<CashFlowControls value={DEFAULT} onChange={vi.fn()} />);
    expect(screen.queryByTestId("cash-flow-account")).not.toBeInTheDocument();
  });
});
