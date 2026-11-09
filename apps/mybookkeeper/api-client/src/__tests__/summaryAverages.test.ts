import { describe, expect, it } from "vitest";
import { monthlyAverage } from "../utils/summaryAverages";

describe("monthlyAverage", () => {
  it("is null when no money moved", () => {
    expect(monthlyAverage([])).toBeNull();
    expect(monthlyAverage([{ month: "2026-01", revenue: 0, expenses: 0, profit: 0 }])).toBeNull();
  });

  it("averages only the months with activity", () => {
    expect(
      monthlyAverage([
        { month: "2026-01", revenue: 1000, expenses: 400, profit: 600 },
        { month: "2026-02", revenue: 0, expenses: 0, profit: 0 },
        { month: "2026-03", revenue: 500, expenses: 800, profit: -300 },
      ]),
    ).toEqual({ months: 2, revenue: 750, expenses: 600, profit: 150 });
  });
});
