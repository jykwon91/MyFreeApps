import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransactionFilterBar from "@/app/features/transactions/TransactionFilterBar";
import type { Filters } from "@/shared/types/transaction/transaction-filters";
import { EMPTY_FILTERS } from "@/shared/lib/transaction-config";
import { aFinancialAccount } from "@/test/financial-account-fixture";


function renderBar(filters: Filters = EMPTY_FILTERS, onChange = vi.fn()) {
  render(<TransactionFilterBar filters={filters} onChange={onChange} properties={[]} accounts={[]} />);
  return { onChange, toggle: screen.getByRole("button", { name: /^Filters/ }) };
}

describe("TransactionFilterBar", () => {
  it("renders each filter once, inside the panel the phone toggle controls", () => {
    const { toggle } = renderBar();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(panel).toHaveClass("hidden", "md:flex");
    for (const name of ["Filter by property", "Filter by status", "Filter by type", "Filter by category", "Filter by scope"]) {
      expect(within(panel).getByRole("combobox", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("combobox")).toHaveLength(5);
    expect(screen.getAllByRole("textbox", { name: "Filter by vendor" })).toHaveLength(1);
    expect(screen.getAllByLabelText("Filter from date")).toHaveLength(1);
    expect(screen.getAllByLabelText("Filter to date")).toHaveLength(1);
  });

  it("the toggle opens and closes the phone filters", async () => {
    const { toggle } = renderBar();
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveClass("hidden");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveClass("hidden");
  });

  it("choosing a type reports it", async () => {
    const { onChange } = renderBar();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Filter by type" }), "expense");

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, transaction_type: "expense" });
  });

  it("offers the shared status choices with their labels and reports the one picked", async () => {
    const { onChange } = renderBar();
    const status = screen.getByRole("combobox", { name: "Filter by status" });

    expect(within(status).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "All Statuses", "Pending", "Approved", "Needs Review", "Duplicate", "Unverified", "Personal Transfer",
    ]);
    await userEvent.selectOptions(status, "needs_review");

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, status: "needs_review" });
  });

  it("the toggle is named with the active filter count, and Clear filters resets them", async () => {
    const { onChange } = renderBar({ ...EMPTY_FILTERS, transaction_type: "expense", vendor: "Power" });
    expect(screen.getByRole("button", { name: "Filters, 2 on" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });
  it("filters by account once there are accounts, closed ones included", async () => {
    const onChange = vi.fn();
    const accounts = [aFinancialAccount(), aFinancialAccount({ id: "acct-9", name: "Old Card", mask: null, closed_on: "2026-01-01" })];
    render(<TransactionFilterBar filters={EMPTY_FILTERS} onChange={onChange} properties={[]} accounts={accounts} />);
    const select = screen.getByRole("combobox", { name: "Filter by account" });

    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "All Accounts", "Chase Checking ··4821", "Old Card",
    ]);
    await userEvent.selectOptions(select, "acct-9");

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, account_id: "acct-9" });
  });

  it("offers Transfer as a type", () => {
    renderBar();
    const type = screen.getByRole("combobox", { name: "Filter by type" });
    expect(within(type).getAllByRole("option").map((option) => option.textContent)).toContain("Transfer");
  });
});
