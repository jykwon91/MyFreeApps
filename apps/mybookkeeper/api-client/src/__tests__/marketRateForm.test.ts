import { describe, expect, it } from "vitest";
import type { MarketRateBenchmark } from "../types/utility/market-rate-benchmark";
import { describeBenchmarkFigure, isFlatService, isMarketRateFigureValid, marketRateToFormValues, toMarketRateUpsert } from "../utils/marketRateForm";

function aBenchmark(overrides: Partial<MarketRateBenchmark> = {}): MarketRateBenchmark {
  return {
    id: "b1",
    service_type: "electricity",
    rate_cents_per_kwh: "11.2500",
    monthly_cents: null,
    source: "Power to Choose",
    observed_on: "2026-01-05",
    notes: "12 month, 5 star",
    is_stale: false,
    created_at: "2026-01-05T00:00:00Z",
    updated_at: "2026-01-05T00:00:00Z",
    ...overrides,
  };
}

describe("isFlatService", () => {
  it("prices only internet by the month", () => {
    expect(isFlatService("internet")).toBe(true);
    expect(["electricity", "natural_gas", "water"].some((service) => isFlatService(service as "water"))).toBe(false);
  });
});

describe("describeBenchmarkFigure", () => {
  it("reads the column the service is priced in", () => {
    expect(describeBenchmarkFigure(aBenchmark())).toBe("11.25¢/kWh");
    expect(describeBenchmarkFigure(aBenchmark({ service_type: "internet", rate_cents_per_kwh: null, monthly_cents: 6999 }))).toBe("$69.99/mo");
  });

  it("shows a dash rather than a wrong unit when the figure is missing", () => {
    expect(describeBenchmarkFigure(aBenchmark({ service_type: "internet", rate_cents_per_kwh: "9.0000", monthly_cents: null }))).toBe("—");
  });
});

describe("marketRateToFormValues", () => {
  it("opens empty, dated today, when nothing is recorded", () => {
    const values = marketRateToFormValues("electricity", undefined);
    expect(values).toMatchObject({ figure: "", source: "", notes: "" });
    expect(values.observedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("seeds a metered rate as stored and a monthly one in dollars", () => {
    expect(marketRateToFormValues("electricity", aBenchmark())).toEqual({ figure: "11.2500", source: "Power to Choose", observedOn: "2026-01-05", notes: "12 month, 5 star" });
    expect(marketRateToFormValues("internet", aBenchmark({ service_type: "internet", rate_cents_per_kwh: null, monthly_cents: 6999 })).figure).toBe("69.99");
  });
});

describe("isMarketRateFigureValid", () => {
  it.each([
    ["11.25", true],
    ["0.5", true],
    ["", false],
    ["  ", false],
    ["0", false],
    ["-3", false],
    ["abc", false],
  ])("%j is %s", (figure, expected) => {
    expect(isMarketRateFigureValid(figure)).toBe(expected);
  });
});

describe("toMarketRateUpsert", () => {
  const values = { figure: " 11.25 ", source: "  Power to Choose ", observedOn: "2026-01-05", notes: "   " };

  it("sends a metered rate as typed text, and no monthly amount", () => {
    expect(toMarketRateUpsert("electricity", values)).toEqual({ rate_cents_per_kwh: "11.25", source: "Power to Choose", observed_on: "2026-01-05", notes: null });
  });

  it("sends internet as whole cents, and no per-kWh rate", () => {
    expect(toMarketRateUpsert("internet", { ...values, figure: "69.99" })).toEqual({ monthly_cents: 6999, source: "Power to Choose", observed_on: "2026-01-05", notes: null });
  });

  it("turns blank text into null so an untouched field is absent", () => {
    expect(toMarketRateUpsert("water", { ...values, source: "" })).toMatchObject({ source: null, notes: null });
  });
});
