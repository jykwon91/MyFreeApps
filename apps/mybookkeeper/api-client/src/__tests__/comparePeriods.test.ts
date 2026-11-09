import { describe, expect, it } from "vitest";
import { changeFigures, comparisonRange } from "../utils/comparePeriods";

describe("comparisonRange, the period before", () => {
  it("sets a whole month against the whole month before", () => {
    expect(comparisonRange({ since: "2026-03-01", until: "2026-03-31" }, "previous_period")).toEqual({ since: "2026-02-01", until: "2026-02-28" });
    expect(comparisonRange({ since: "2026-03-01", until: "2026-03-31" }, "previous_period")).not.toEqual({ since: "2026-01-29", until: "2026-02-28" });
  });

  it("finds the last day of a short month before a long one", () => {
    expect(comparisonRange({ since: "2024-03-01", until: "2024-03-31" }, "previous_period")).toEqual({ since: "2024-02-01", until: "2024-02-29" });
  });

  it("sets several whole months against as many months before", () => {
    expect(comparisonRange({ since: "2026-04-01", until: "2026-06-30" }, "previous_period")).toEqual({ since: "2026-01-01", until: "2026-03-31" });
    expect(comparisonRange({ since: "2026-01-01", until: "2026-03-31" }, "previous_period")).toEqual({ since: "2025-10-01", until: "2025-12-31" });
  });

  it("sets the first days of a month against the same days of the month before", () => {
    expect(comparisonRange({ since: "2026-11-01", until: "2026-11-09" }, "previous_period")).toEqual({ since: "2026-10-01", until: "2026-10-09" });
  });

  it("sets a range that does not start on the 1st against the same number of days before it", () => {
    expect(comparisonRange({ since: "2026-03-10", until: "2026-03-19" }, "previous_period")).toEqual({ since: "2026-02-28", until: "2026-03-09" });
  });
});

describe("comparisonRange, the same dates last year", () => {
  it("moves both ends back a year", () => {
    expect(comparisonRange({ since: "2026-03-01", until: "2026-03-31" }, "previous_year")).toEqual({ since: "2025-03-01", until: "2025-03-31" });
  });

  it("keeps a leap day on the last day of February", () => {
    expect(comparisonRange({ since: "2024-02-01", until: "2024-02-29" }, "previous_year")).toEqual({ since: "2023-02-01", until: "2023-02-28" });
  });
});

describe("changeFigures", () => {
  it("gives the change and its percentage", () => {
    expect(changeFigures(150, 100)).toEqual({ delta: 50, percent: 50 });
    expect(changeFigures(50, 100)).toEqual({ delta: -50, percent: -50 });
  });

  it("gives no percentage, and no infinity, when there was nothing before", () => {
    expect(changeFigures(120, 0)).toEqual({ delta: 120, percent: null });
    expect(changeFigures(0, 0)).toEqual({ delta: 0, percent: null });
  });

  it("measures a loss that shrank as an improvement, not a collapse", () => {
    expect(changeFigures(-50, -100)).toEqual({ delta: 50, percent: 50 });
  });
});
