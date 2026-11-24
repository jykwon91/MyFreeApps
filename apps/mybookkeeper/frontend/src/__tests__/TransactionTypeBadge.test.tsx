import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TransactionTypeBadge from "@/app/features/transactions/TransactionTypeBadge";

describe("TransactionTypeBadge", () => {
  it.each([
    ["income", "Income", "bg-green-100"],
    ["expense", "Expense", "bg-red-100"],
    ["transfer", "Transfer", "bg-slate-100"],
  ] as const)("labels %s", (type, label, colour) => {
    render(<TransactionTypeBadge type={type} />);
    expect(screen.getByText(label)).toHaveClass(colour);
  });
});
