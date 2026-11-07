import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransactionFilterBar from "@/app/features/transactions/TransactionFilterBar";
import type { Filters } from "@/shared/types/transaction/transaction-filters";
import { EMPTY_FILTERS } from "@/shared/lib/transaction-config";


function renderBar(filters: Filters = EMPTY_FILTERS, onChange = vi.fn()) {
  render(<TransactionFilterBar filters={filters} onChange={onChange} properties={[]} />);
  return { onChange, toggle: screen.getByRole("button", { name: /^Filters/ }) };
}

describe("TransactionFilterBar", () => {
  it("renders each filter once, inside the panel the phone toggle controls", () => {
    const { toggle } = renderBar();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(panel).toHaveClass("hidden", "md:flex");
    for (const name of ["Filter by property", "Filter by status", "Filter by type", "Filter by category"]) {
      expect(within(panel).getByRole("combobox", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("combobox")).toHaveLength(4);
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

  it("the toggle is named with the active filter count, and Clear filters resets them", async () => {
    const { onChange } = renderBar({ ...EMPTY_FILTERS, transaction_type: "expense", vendor: "Power" });
    expect(screen.getByRole("button", { name: "Filters, 2 on" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });
});
