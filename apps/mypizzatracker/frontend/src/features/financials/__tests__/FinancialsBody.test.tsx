import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import FinancialsBody from "../FinancialsBody";
import type { DropFinancials } from "@/types/financials/financials";

let query: { currentData: DropFinancials | undefined; isError: boolean };

vi.mock("@/store/financialsApi", () => ({
  useGetFinancialsQuery: () => ({ ...query, refetch: vi.fn() }),
}));
vi.mock("../SummaryCard", () => ({ default: () => <div data-testid="summary" /> }));
vi.mock("../ExpensesSection", () => ({ default: () => <div data-testid="expenses" /> }));

describe("FinancialsBody when the figures are refetched", () => {
  beforeEach(() => {
    query = { currentData: undefined, isError: false };
  });

  it("keeps the figures on screen when a refetch fails", () => {
    query = { currentData: { drop: { status: "active" } } as DropFinancials, isError: true };
    render(<FinancialsBody dropId="d1" />);

    expect(screen.getByTestId("summary")).toBeInTheDocument();
    expect(screen.queryByText("Failed to load financials.")).not.toBeInTheDocument();
  });

  it("says the figures couldn't load, with Retry, when they never did", () => {
    query = { currentData: undefined, isError: true };
    render(<FinancialsBody dropId="d1" />);

    expect(screen.getByText("Failed to load financials.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
