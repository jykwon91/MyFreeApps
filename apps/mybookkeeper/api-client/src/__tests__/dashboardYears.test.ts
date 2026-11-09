import { describe, expect, it } from "vitest";
import { dashboardYears } from "../utils/dashboardYears";

describe("dashboardYears", () => {
  it("always offers the current year", () => {
    expect(dashboardYears(undefined, 2026)).toEqual([2026]);
    expect(dashboardYears([], 2026)).toEqual([2026]);
  });

  it("lists every year with data, newest first, once", () => {
    expect(dashboardYears([2023, 2026, 2024, 2023], 2026)).toEqual([2026, 2024, 2023]);
  });

  it("ignores values that are not years", () => {
    expect(dashboardYears([1800, 2024.5, 2024], 2026)).toEqual([2026, 2024]);
  });
});
