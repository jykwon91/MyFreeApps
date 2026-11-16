import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import { describe, expect, it } from "vitest";
import { BENCHMARK_FORM_PROBLEMS } from "../constants/benchmarkForm";
import type { MarketRateBenchmark } from "../types/utility/market-rate-benchmark";
import { describeBenchmarkFigure, isFlatService, marketRateFormProblems, marketRateToFormValues, toMarketRateUpsert } from "../utils/marketRateForm";

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

describe("marketRateFormProblems", () => {
  const TODAY = "2026-03-01";
  const ok = { figure: "11.25", source: "Power to Choose", observedOn: "2026-03-01", notes: "" };
  const problems = (service: "electricity" | "internet", change: Partial<typeof ok>, decimalSeparator: DecimalSeparator = ".") =>
    marketRateFormProblems(service, { ...ok, ...change }, TODAY, decimalSeparator);

  it("has nothing to say about a form the backend accepts", () => {
    expect(problems("electricity", {})).toEqual({});
    expect(problems("electricity", { figure: "999.9999", source: "x".repeat(255), notes: "n".repeat(5000) })).toEqual({});
    expect(problems("internet", { figure: "69.99" })).toEqual({});
  });

  it.each(["", "  ", "0", "-3", "abc", "1e3", "0.00"])("asks for a rate above zero, not %j", (figure) => {
    expect(problems("electricity", { figure }).figure).toBe(BENCHMARK_FORM_PROBLEMS.rateRequired);
  });

  it("refuses a rate past 999.9999", () => {
    expect(problems("electricity", { figure: "1000" }).figure).toBe(BENCHMARK_FORM_PROBLEMS.rateTooHigh("."));
    expect(problems("electricity", { figure: "999.99991" }).figure).toBe(BENCHMARK_FORM_PROBLEMS.rateTooPrecise);
  });

  it("refuses more than four decimal places on a rate", () => {
    expect(problems("electricity", { figure: "11.12345" }).figure).toBe(BENCHMARK_FORM_PROBLEMS.rateTooPrecise);
    expect(problems("electricity", { figure: "11.1234" }).figure).toBeUndefined();
  });

  it("reads a rate typed with a decimal comma on a comma phone, by the same rules", () => {
    expect(problems("electricity", { figure: "11,25" }, ",")).toEqual({});
    expect(problems("electricity", { figure: "11.25" }, ",")).toEqual({});
    expect(problems("electricity", { figure: "11,12345" }, ",").figure).toBe(BENCHMARK_FORM_PROBLEMS.rateTooPrecise);
    expect(problems("electricity", { figure: "1000,5" }, ",").figure).toBe(BENCHMARK_FORM_PROBLEMS.rateTooHigh(","));
    expect(problems("electricity", { figure: "11,2,5" }, ",").figure).toBe(BENCHMARK_FORM_PROBLEMS.rateRequired);
    expect(problems("electricity", { figure: "11,25" }, ".").figure).toBe(BENCHMARK_FORM_PROBLEMS.rateRequired);
    expect(BENCHMARK_FORM_PROBLEMS.rateTooHigh(",")).toContain("999,9999");
  });

  it("asks internet for dollars and cents above zero", () => {
    expect(problems("internet", { figure: "0" }).figure).toBe(BENCHMARK_FORM_PROBLEMS.monthlyRequired);
    expect(problems("internet", { figure: "69.999" }).figure).toBe(BENCHMARK_FORM_PROBLEMS.moneyTooPrecise);
    expect(problems("internet", { figure: "1e20" }).figure).toBe(BENCHMARK_FORM_PROBLEMS.monthlyRequired);
    expect(problems("internet", { figure: "99999999999999999999" }).figure).toBe(BENCHMARK_FORM_PROBLEMS.monthlyTooLarge);
  });

  it("does not apply the per-kWh ceiling to a monthly price", () => {
    expect(problems("internet", { figure: "1500.00" })).toEqual({});
  });

  it("limits source to 255 and notes to 5000, counted as they will be sent", () => {
    expect(problems("electricity", { source: "x".repeat(256) }).source).toBe(BENCHMARK_FORM_PROBLEMS.sourceTooLong);
    expect(problems("electricity", { source: ` ${"x".repeat(255)} ` }).source).toBeUndefined();
    expect(problems("electricity", { notes: "n".repeat(5001) }).notes).toBe(BENCHMARK_FORM_PROBLEMS.notesTooLong);
  });

  it("needs a date that is not after today", () => {
    expect(problems("electricity", { observedOn: "" }).observedOn).toBe(BENCHMARK_FORM_PROBLEMS.dateRequired);
    expect(problems("electricity", { observedOn: "2026-03-02" }).observedOn).toBe(BENCHMARK_FORM_PROBLEMS.dateInFuture);
    expect(problems("electricity", { observedOn: TODAY }).observedOn).toBeUndefined();
  });

  it("reports every field at once", () => {
    expect(Object.keys(problems("electricity", { figure: "", source: "x".repeat(256), observedOn: "", notes: "n".repeat(5001) })).sort()).toEqual(["figure", "notes", "observedOn", "source"]);
  });
});

describe("toMarketRateUpsert", () => {
  const values = { figure: " 11.25 ", source: "  Power to Choose ", observedOn: "2026-01-05", notes: "   " };

  it("sends a metered rate as typed text, and no monthly amount", () => {
    expect(toMarketRateUpsert("electricity", values, ".")).toEqual({ rate_cents_per_kwh: "11.25", source: "Power to Choose", observed_on: "2026-01-05", notes: null });
  });

  it("sends a decimal-comma rate as the \".\" rate the form checked", () => {
    expect(toMarketRateUpsert("electricity", { ...values, figure: " 11,25 " }, ",")).toMatchObject({ rate_cents_per_kwh: "11.25" });
  });

  it("sends internet as whole cents, and no per-kWh rate", () => {
    expect(toMarketRateUpsert("internet", { ...values, figure: "69.99" }, ".")).toEqual({ monthly_cents: 6999, source: "Power to Choose", observed_on: "2026-01-05", notes: null });
  });

  it("turns blank text into null so an untouched field is absent", () => {
    expect(toMarketRateUpsert("water", { ...values, source: "" }, ".")).toMatchObject({ source: null, notes: null });
  });
});
