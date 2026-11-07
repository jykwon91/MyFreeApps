import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransactionFilterBar from "@/app/features/transactions/TransactionFilterBar";
import type { Filters } from "@/shared/types/transaction/transaction-filters";
import { EMPTY_FILTERS } from "@/shared/lib/transaction-config";


function renderBar(filters: Filters = EMPTY_FILTERS, onChange = vi.fn()) {
  render(<TransactionFilterBar filters={filters} onChange={onChange} properties={[]} />);
  return { onChange, toggle: screen.getByRole("button", { name: /Filters/ }) };
}

describe("TransactionFilterBar", () => {
  it("starts with the mobile filters collapsed", () => {
    const { toggle } = renderBar();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toBeNull();
  });

  it("the toggle opens and closes the mobile filters it controls", async () => {
    const { toggle } = renderBar();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    for (const name of ["Filter by property", "Filter by status", "Filter by type", "Filter by category"]) {
      expect(within(panel).getByRole("combobox", { name })).toBeInTheDocument();
    }
    expect(within(panel).getByRole("textbox", { name: "Filter by vendor" })).toBeInTheDocument();
    expect(within(panel).getByLabelText("Filter from date")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Filter to date")).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toBeNull();
  });

  it("choosing a type in the mobile filters reports it", async () => {
    const { toggle, onChange } = renderBar();
    await userEvent.click(toggle);
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;

    await userEvent.selectOptions(within(panel).getByRole("combobox", { name: "Filter by type" }), "expense");

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, transaction_type: "expense" });
  });

  it("the toggle counts the active filters, and Clear filters resets them", async () => {
    const { toggle, onChange } = renderBar({ ...EMPTY_FILTERS, transaction_type: "expense", vendor: "Power" });
    expect(toggle).toHaveTextContent(/^Filters\s*2$/);

    // Only the desktop copy is rendered while the mobile panel is collapsed.
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });
});
