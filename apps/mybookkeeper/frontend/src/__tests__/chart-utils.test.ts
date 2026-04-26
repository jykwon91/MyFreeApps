import { describe, it, expect } from "vitest";
import { mergeData, buildFilter, formatMonthLabel } from "@/shared/utils/chart-utils";
import type { MonthSummary } from "@/shared/types/summary/month-summary";
import type { MonthExpenseSummary } from "@/shared/types/summary/month-expense-summary";

describe("formatMonthLabel", () => {
  it("formats a yyyy-MM string to abbreviated month and 2-digit year", () => {
    expect(formatMonthLabel("2025-01")).toBe("Jan 25");
    expect(formatMonthLabel("2025-12")).toBe("Dec 25");
  });

  it("handles year boundaries correctly", () => {
    expect(formatMonthLabel("2024-06")).toBe("Jun 24");
    expect(formatMonthLabel("2026-03")).toBe("Mar 26");
  });
});

describe("mergeData", () => {
  it("combines income and expense data for the same month", () => {
    const byMonth: MonthSummary[] = [
      { month: "2025-01", revenue: 1500, expenses: 600, profit: 900 },
    ];
    const byMonthExpense: MonthExpenseSummary[] = [
      { month: "2025-01", maintenance: 400, utilities: 200 },
    ];

    const { chartData: result } = mergeData(byMonth, byMonthExpense);

    expect(result).toHaveLength(1);
    expect(result[0].rawMonth).toBe("2025-01");
    expect(result[0].revenue).toBe(1500);
    expect(result[0].profit).toBe(900);
    expect(result[0].maintenance).toBe(400);
    expect(result[0].utilities).toBe(200);
  });

  it("includes months that appear only in byMonth", () => {
    const byMonth: MonthSummary[] = [
      { month: "2025-02", revenue: 2000, expenses: 800, profit: 1200 },
    ];
    const byMonthExpense: MonthExpenseSummary[] = [];

    const { chartData: result } = mergeData(byMonth, byMonthExpense);

    expect(result).toHaveLength(1);
    expect(result[0].rawMonth).toBe("2025-02");
    expect(result[0].revenue).toBe(2000);
    expect(result[0].maintenance).toBe(0);
  });

  it("includes months that appear only in byMonthExpense", () => {
    const byMonth: MonthSummary[] = [];
    const byMonthExpense: MonthExpenseSummary[] = [
      { month: "2025-03", insurance: 300 },
    ];

    const { chartData: result } = mergeData(byMonth, byMonthExpense);

    expect(result).toHaveLength(1);
    expect(result[0].rawMonth).toBe("2025-03");
    expect(result[0].revenue).toBe(0);
    expect(result[0].profit).toBe(0);
    expect(result[0].insurance).toBe(300);
  });

  it("returns rows sorted by month in ascending order", () => {
    const byMonth: MonthSummary[] = [
      { month: "2025-03", revenue: 100, expenses: 50, profit: 50 },
      { month: "2025-01", revenue: 200, expenses: 80, profit: 120 },
    ];
    const byMonthExpense: MonthExpenseSummary[] = [
      { month: "2025-02", maintenance: 75 },
    ];

    const { chartData: result } = mergeData(byMonth, byMonthExpense);

    expect(result.map((r) => r.rawMonth)).toEqual(["2025-01", "2025-02", "2025-03"]);
  });

  it("returns empty chartData when both inputs are empty", () => {
    const { chartData, propertyKeys } = mergeData([], []);
    expect(chartData).toEqual([]);
    expect(propertyKeys).toEqual([]);
  });

  it("defaults missing expense categories to 0", () => {
    const byMonth: MonthSummary[] = [
      { month: "2025-01", revenue: 1000, expenses: 500, profit: 500 },
    ];
    const byMonthExpense: MonthExpenseSummary[] = [
      { month: "2025-01", maintenance: 200 },
    ];

    const { chartData: result } = mergeData(byMonth, byMonthExpense);

    // All categories not present in the expense row should default to 0
    expect(result[0].utilities).toBe(0);
    expect(result[0].insurance).toBe(0);
    expect(result[0].taxes).toBe(0);
  });

  it("sets the displayMonth label from formatMonthLabel", () => {
    const byMonth: MonthSummary[] = [
      { month: "2025-06", revenue: 500, expenses: 200, profit: 300 },
    ];

    const { chartData: result } = mergeData(byMonth, []);

    expect(result[0].displayMonth).toBe("Jun 25");
  });
});

describe("buildFilter", () => {
  const entryJanuary = {
    displayMonth: "Jan 25",
    rawMonth: "2025-01",
    revenue: 1500,
    profit: 900,
    maintenance: 400,
  };

  it("returns type revenue and no category when dataKey is revenue", () => {
    const filter = buildFilter("revenue", entryJanuary);

    expect(filter.type).toBe("revenue");
    expect(filter.category).toBeUndefined();
  });

  it("returns category and no type when dataKey is an expense category", () => {
    const filter = buildFilter("maintenance", entryJanuary);

    expect(filter.category).toBe("maintenance");
    expect(filter.type).toBeUndefined();
  });

  it("sets startDate to the first day of the month", () => {
    const filter = buildFilter("revenue", entryJanuary);
    expect(filter.startDate).toBe("2025-01-01");
  });

  it("sets endDate to the last day of the month", () => {
    const filter = buildFilter("revenue", entryJanuary);
    expect(filter.endDate).toBe("2025-01-31");
  });

  it("sets correct end of month for February", () => {
    const entryFeb = { ...entryJanuary, rawMonth: "2025-02" };
    const filter = buildFilter("revenue", entryFeb);
    expect(filter.endDate).toBe("2025-02-28");
  });

  it("sets correct end of month for February in a leap year", () => {
    const entryFebLeap = { ...entryJanuary, rawMonth: "2024-02" };
    const filter = buildFilter("revenue", entryFebLeap);
    expect(filter.endDate).toBe("2024-02-29");
  });

  it("builds revenue label with month name", () => {
    const filter = buildFilter("revenue", entryJanuary);
    expect(filter.label).toBe("Revenue — January 2025");
  });

  it("builds expense category label with formatted category name and month", () => {
    const filter = buildFilter("maintenance", entryJanuary);
    expect(filter.label).toBe("Maintenance — January 2025");
  });

  it("formats multi-word category keys in the label", () => {
    const filter = buildFilter("mortgage_interest", entryJanuary);
    expect(filter.label).toBe("Mortgage Interest — January 2025");
  });
});
