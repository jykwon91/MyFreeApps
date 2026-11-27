import { describe, expect, it } from "vitest";
import { cashFlowChartRows } from "../utils/cashFlowChartRows";

describe("cashFlowChartRows", () => {
  it("turns cents into dollars, splits money out and labels each month", () => {
    const rows = cashFlowChartRows([
      { month: "2026-10", money_in_cents: 500_000, money_out_cents: 320_050, mortgages_loans_cents: 300_000, net_cents: 179_950 },
      { month: "2026-11", money_in_cents: 0, money_out_cents: 1_000, mortgages_loans_cents: 0, net_cents: -1_000 },
    ]);
    expect(rows).toEqual([
      { month: "2026-10", label: "Oct 26", moneyIn: 5000, moneyOut: 3200.5, spending: 200.5, mortgagesLoans: 3000, net: 1799.5 },
      { month: "2026-11", label: "Nov 26", moneyIn: 0, moneyOut: 10, spending: 10, mortgagesLoans: 0, net: -10 },
    ]);
  });
});
