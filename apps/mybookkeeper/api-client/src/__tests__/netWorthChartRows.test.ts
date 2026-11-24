import { describe, expect, it } from "vitest";
import { netWorthChartRows } from "../utils/netWorthChartRows";

describe("netWorthChartRows", () => {
  it("turns cents into dollars and labels the day without shifting it", () => {
    const [row] = netWorthChartRows([
      { day: "2026-11-01", assets_cents: 150_000, liabilities_cents: 50_025, net_cents: 99_975 },
    ]);
    expect(row).toEqual({ day: "2026-11-01", label: "Nov 1", net: 999.75, assets: 1500, liabilities: 500.25 });
  });

  it("keeps a negative net worth negative", () => {
    const [row] = netWorthChartRows([{ day: "2026-01-31", assets_cents: 0, liabilities_cents: 100, net_cents: -100 }]);
    expect(row?.net).toBe(-1);
  });
});
