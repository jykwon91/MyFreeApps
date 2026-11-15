import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ExpenseRow from "../ExpenseRow";
import type { ExpenseRead } from "@/types/financials/financials";

vi.mock("@/store/financialsApi", () => ({
  useUpdateExpenseMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteExpenseMutation: () => [vi.fn(), { isLoading: false }],
}));

const expense = {
  id: "e1",
  vendor: "Costco",
  category: "Ingredients",
  amount: "40.00",
  description: null,
} as ExpenseRead;

function vendorInput() {
  return screen.getByLabelText("Vendor") as HTMLInputElement;
}

function renderRow(row: ExpenseRead) {
  return <ExpenseRow dropId="d1" expense={row} readOnly={false} />;
}

describe("ExpenseRow editor", () => {
  it("reopens with the new values after the expense changes", () => {
    const { rerender } = render(renderRow(expense));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    rerender(renderRow({ ...expense, vendor: "Restaurant Depot", amount: "55.25" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(vendorInput().value).toBe("Restaurant Depot");
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("55.25");
  });

  it("drops a cancelled half-typed edit", () => {
    render(renderRow(expense));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(vendorInput(), { target: { value: "abandoned" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(vendorInput().value).toBe("Costco");
  });
});
