import { describe, expect, it } from "vitest";
import {
  personalFinancesQueryFrom,
  personalFinancesSearchParams,
  yearAround,
  yearOf,
  yearQuery,
} from "@/app/features/personal-finances/personal-finances-search-params";

describe("personal finances search params", () => {
  it("reads months back and drops anything that isn't one", () => {
    expect(personalFinancesQueryFrom(new URLSearchParams("start=2026-01&end=2026-12"))).toEqual({ start: "2026-01", end: "2026-12" });
    expect(personalFinancesQueryFrom(new URLSearchParams("start=2026-13&end=soon"))).toEqual({ start: null, end: null });
  });

  it("leaves what isn't set out of the URL", () => {
    expect(personalFinancesSearchParams({ start: null, end: null })).toEqual({});
    expect(personalFinancesSearchParams({ start: "2026-08", end: null })).toEqual({ start: "2026-08" });
  });

  it("knows a whole year from a few months of one", () => {
    expect(yearOf(yearQuery(2025))).toBe(2025);
    expect(yearOf({ start: "2026-08", end: "2026-10" })).toBeNull();
    expect(yearOf({ start: null, end: null })).toBeNull();
    expect(yearAround({ start: "2026-08", end: "2026-10" })).toBe(2026);
    expect(yearAround({ start: "2025-11", end: "2026-02" })).toBeNull();
  });
});
