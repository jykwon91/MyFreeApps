import { describe, expect, it } from "vitest";
import type { InsuranceBenchmark } from "../types/insurance/insurance-benchmark";
import type { InsuranceBenchmarkFormValues } from "../types/insurance/insurance-benchmark-form-values";
import { BENCHMARK_FORM_PROBLEMS } from "../constants/benchmarkForm";
import { benchmarkFormPayload, benchmarkFormProblems, benchmarkToFormValues, positiveDollarsToCents } from "../utils/insuranceBenchmarkForm";

const EXISTING: InsuranceBenchmark = {
  id: "b1",
  annual_premium_cents: 120_050,
  coverage_amount_cents: 40_000_000,
  region_label: "Houston",
  source: null,
  observed_on: "2026-02-01",
  notes: "Quote",
  rate_cents_per_1000_coverage: "300.00",
  is_stale: false,
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-01T00:00:00Z",
};

const TODAY = "2026-05-05";
const FILLED: InsuranceBenchmarkFormValues = { premium: "1200.50", coverage: "400000", regionLabel: " Houston ", source: "", observedOn: "2026-02-01", notes: "" };

describe("positiveDollarsToCents", () => {
  it.each([
    ["12", 1200],
    [" 12.34 ", 1234],
    ["0.1", 10],
  ])("turns %s into %s cents", (text, cents) => {
    expect(positiveDollarsToCents(text)).toBe(cents);
  });

  it.each(["", "  ", "abc", "0", "-5", "Infinity"])("rejects %j", (text) => {
    expect(positiveDollarsToCents(text)).toBeNull();
  });
});

describe("benchmarkToFormValues", () => {
  it("starts blank, dated today, when nothing is recorded", () => {
    expect(benchmarkToFormValues(null, "2026-05-05")).toEqual({ premium: "", coverage: "", regionLabel: "", source: "", observedOn: "2026-05-05", notes: "" });
  });

  it("starts from the recorded figure", () => {
    expect(benchmarkToFormValues(EXISTING, "2026-05-05")).toEqual({ premium: "1200.50", coverage: "400000", regionLabel: "Houston", source: "", observedOn: "2026-02-01", notes: "Quote" });
  });
});

describe("benchmarkFormPayload", () => {
  it("turns a filled form into the request, trimming text and nulling blanks", () => {
    expect(benchmarkFormPayload(FILLED, TODAY)).toEqual({
      annual_premium_cents: 120_050,
      coverage_amount_cents: 40_000_000,
      region_label: "Houston",
      source: null,
      observed_on: "2026-02-01",
      notes: null,
    });
  });

  it.each([{ premium: "" }, { coverage: "0" }, { observedOn: "" }])("is not ready to send with %j", (change) => {
    expect(benchmarkFormPayload({ ...FILLED, ...change }, TODAY)).toBeNull();
  });
});

describe("benchmarkFormProblems", () => {
  const problems = (change: Partial<InsuranceBenchmarkFormValues>) => benchmarkFormProblems({ ...FILLED, ...change }, TODAY);

  it("has nothing to say about a form the backend accepts", () => {
    expect(problems({})).toEqual({});
    expect(problems({ premium: "10000000", coverage: "1000000000", regionLabel: "r".repeat(120), source: "s".repeat(255), notes: "n".repeat(5000) })).toEqual({});
  });

  it.each(["", "0", "-1", "abc", "1e3"])("asks for a premium above zero, not %j", (premium) => {
    expect(problems({ premium }).premium).toBe(BENCHMARK_FORM_PROBLEMS.premiumRequired);
  });

  it.each(["", "0", "abc"])("asks for coverage above zero, not %j", (coverage) => {
    expect(problems({ coverage }).coverage).toBe(BENCHMARK_FORM_PROBLEMS.coverageRequired);
  });

  it("caps the premium at $10,000,000 and coverage at $1,000,000,000", () => {
    expect(problems({ premium: "10000000.01" }).premium).toBe(BENCHMARK_FORM_PROBLEMS.premiumTooHigh);
    expect(problems({ coverage: "1000000001" }).coverage).toBe(BENCHMARK_FORM_PROBLEMS.coverageTooHigh);
  });

  it("refuses fractions of a cent", () => {
    expect(problems({ premium: "1200.505" }).premium).toBe(BENCHMARK_FORM_PROBLEMS.moneyTooPrecise);
    expect(problems({ coverage: "400000.001" }).coverage).toBe(BENCHMARK_FORM_PROBLEMS.moneyTooPrecise);
  });

  it("limits region to 120, source to 255 and notes to 5000, counted as they will be sent", () => {
    expect(problems({ regionLabel: "r".repeat(121) }).regionLabel).toBe(BENCHMARK_FORM_PROBLEMS.regionTooLong);
    expect(problems({ regionLabel: ` ${"r".repeat(120)} ` }).regionLabel).toBeUndefined();
    expect(problems({ source: "s".repeat(256) }).source).toBe(BENCHMARK_FORM_PROBLEMS.sourceTooLong);
    expect(problems({ notes: "n".repeat(5001) }).notes).toBe(BENCHMARK_FORM_PROBLEMS.notesTooLong);
  });

  it("needs a date that is not after today", () => {
    expect(problems({ observedOn: "" }).observedOn).toBe(BENCHMARK_FORM_PROBLEMS.dateRequired);
    expect(problems({ observedOn: "2026-05-06" }).observedOn).toBe(BENCHMARK_FORM_PROBLEMS.dateInFuture);
    expect(problems({ observedOn: TODAY }).observedOn).toBeUndefined();
  });

  it("is not ready to send when any rule is broken", () => {
    expect(benchmarkFormPayload({ ...FILLED, premium: "10000001" }, TODAY)).toBeNull();
    expect(benchmarkFormPayload({ ...FILLED, notes: "n".repeat(5001) }, TODAY)).toBeNull();
    expect(benchmarkFormPayload({ ...FILLED, observedOn: "2026-05-06" }, TODAY)).toBeNull();
  });
});
