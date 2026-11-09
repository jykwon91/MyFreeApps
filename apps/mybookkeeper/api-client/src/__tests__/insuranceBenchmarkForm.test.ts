import { describe, expect, it } from "vitest";
import type { InsuranceBenchmark } from "../types/insurance/insurance-benchmark";
import type { InsuranceBenchmarkFormValues } from "../types/insurance/insurance-benchmark-form-values";
import { benchmarkFormPayload, benchmarkToFormValues, positiveDollarsToCents } from "../utils/insuranceBenchmarkForm";

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
    expect(benchmarkFormPayload(FILLED)).toEqual({
      annual_premium_cents: 120_050,
      coverage_amount_cents: 40_000_000,
      region_label: "Houston",
      source: null,
      observed_on: "2026-02-01",
      notes: null,
    });
  });

  it.each([{ premium: "" }, { coverage: "0" }, { observedOn: "" }])("is not ready to send with %j", (change) => {
    expect(benchmarkFormPayload({ ...FILLED, ...change })).toBeNull();
  });
});
