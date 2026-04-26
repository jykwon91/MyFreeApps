import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MonthlyAverageCard from "@/app/features/dashboard/MonthlyAverageCard";
import type { MonthSummary } from "@/shared/types/summary/month-summary";

describe("MonthlyAverageCard", () => {
  it("renders nothing when there are no months with data", () => {
    const { container } = render(<MonthlyAverageCard byMonth={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when all months are zero", () => {
    const months: MonthSummary[] = [
      { month: "2025-01", revenue: 0, expenses: 0, profit: 0 },
      { month: "2025-02", revenue: 0, expenses: 0, profit: 0 },
    ];
    const { container } = render(<MonthlyAverageCard byMonth={months} />);
    expect(container.firstChild).toBeNull();
  });

  it("computes averages over active months only", () => {
    const months: MonthSummary[] = [
      { month: "2025-01", revenue: 1000, expenses: 400, profit: 600 },
      { month: "2025-02", revenue: 0, expenses: 0, profit: 0 }, // skipped
      { month: "2025-03", revenue: 3000, expenses: 800, profit: 2200 },
    ];
    render(<MonthlyAverageCard byMonth={months} />);

    expect(screen.getByText("Monthly Average")).toBeInTheDocument();
    expect(screen.getByText("across 2 months")).toBeInTheDocument();
    // Revenue avg = (1000 + 3000) / 2 = 2000
    expect(screen.getByText("$2,000.00")).toBeInTheDocument();
    // Expenses avg = (400 + 800) / 2 = 600
    expect(screen.getByText("$600.00")).toBeInTheDocument();
    // Profit avg = (600 + 2200) / 2 = 1400
    expect(screen.getByText("$1,400.00")).toBeInTheDocument();
  });

  it("uses singular 'month' when count is 1", () => {
    const months: MonthSummary[] = [
      { month: "2025-01", revenue: 500, expenses: 100, profit: 400 },
    ];
    render(<MonthlyAverageCard byMonth={months} />);
    expect(screen.getByText("across 1 month")).toBeInTheDocument();
  });

  it("renders profit in red when negative", () => {
    const months: MonthSummary[] = [
      { month: "2025-01", revenue: 100, expenses: 500, profit: -400 },
    ];
    render(<MonthlyAverageCard byMonth={months} />);
    const profit = screen.getByText("-$400.00");
    expect(profit).toHaveClass("text-red-500");
  });

  it("renders profit in green when positive", () => {
    const months: MonthSummary[] = [
      { month: "2025-01", revenue: 1000, expenses: 200, profit: 800 },
    ];
    render(<MonthlyAverageCard byMonth={months} />);
    const profit = screen.getByText("$800.00");
    expect(profit).toHaveClass("text-green-600");
  });
});
