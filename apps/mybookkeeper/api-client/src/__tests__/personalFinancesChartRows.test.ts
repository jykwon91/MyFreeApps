import { describe, expect, it } from "vitest";
import { personalFinancesChartRows } from "../utils/personalFinancesChartRows";

describe("personalFinancesChartRows", () => {
  it("turns cents into dollars, splits expenses and labels each month", () => {
    const rows = personalFinancesChartRows([
      { month: "2026-10", income_cents: 900_000, expenses_cents: 450_050, mortgages_loans_cents: 341_396, net_cents: 449_950 },
      { month: "2026-11", income_cents: -20_000, expenses_cents: 0, mortgages_loans_cents: 0, net_cents: -20_000 },
    ]);
    expect(rows).toEqual([
      { month: "2026-10", label: "Oct 26", income: 9000, spending: 1086.54, mortgagesLoans: 3413.96, net: 4499.5 },
      { month: "2026-11", label: "Nov 26", income: -200, spending: 0, mortgagesLoans: 0, net: -200 },
    ]);
  });
});
