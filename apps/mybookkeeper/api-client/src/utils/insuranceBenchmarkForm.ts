import {
  BENCHMARK_FORM_PROBLEMS,
  BENCHMARK_MONEY_MAX_DECIMALS,
  BENCHMARK_NOTES_MAX_LENGTH,
  BENCHMARK_SOURCE_MAX_LENGTH,
  INSURANCE_BENCHMARK_MAX_ANNUAL_PREMIUM_DOLLARS,
  INSURANCE_BENCHMARK_MAX_COVERAGE_DOLLARS,
  INSURANCE_BENCHMARK_REGION_MAX_LENGTH,
} from "../constants/benchmarkForm";
import type { InsuranceBenchmark } from "../types/insurance/insurance-benchmark";
import type { InsuranceBenchmarkFormProblems } from "../types/insurance/insurance-benchmark-form-problems";
import type { InsuranceBenchmarkFormValues } from "../types/insurance/insurance-benchmark-form-values";
import type { InsuranceBenchmarkUpsertRequest } from "../types/insurance/insurance-benchmark-upsert-request";
import { decimalPlaces, isPlainNumber, isTooLong, observedOnProblem } from "./benchmarkFieldChecks";

/** Dollars typed into an input → integer cents, or null when blank, unreadable or not above zero. */
export function positiveDollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

/** The form's starting text: the recorded benchmark, or blanks dated today. */
export function benchmarkToFormValues(
  existing: InsuranceBenchmark | null | undefined,
  today: string,
): InsuranceBenchmarkFormValues {
  return {
    premium: existing ? (existing.annual_premium_cents / 100).toFixed(2) : "",
    coverage: existing ? (existing.coverage_amount_cents / 100).toFixed(0) : "",
    regionLabel: existing?.region_label ?? "",
    source: existing?.source ?? "",
    observedOn: existing?.observed_on ?? today,
    notes: existing?.notes ?? "",
  };
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function moneyProblem(text: string, maxDollars: number, messages: { required: string; tooHigh: string }): string | undefined {
  const trimmed = text.trim();
  if (!isPlainNumber(trimmed) || Number(trimmed) <= 0) return messages.required;
  if (decimalPlaces(trimmed) > BENCHMARK_MONEY_MAX_DECIMALS) return BENCHMARK_FORM_PROBLEMS.moneyTooPrecise;
  return Number(trimmed) > maxDollars ? messages.tooHigh : undefined;
}

/**
 * Every rule the backend applies to a market-premium request, keyed by the field to point at.
 * Both figures are required, and deliberately so: the comparison runs on premium per $1,000
 * of coverage, so a premium with no coverage behind it cannot be normalised. Empty means the
 * server has nothing to refuse, so a 422 after this is unexpected.
 */
export function benchmarkFormProblems(values: InsuranceBenchmarkFormValues, today: string): InsuranceBenchmarkFormProblems {
  const problems: InsuranceBenchmarkFormProblems = {};
  const premium = moneyProblem(values.premium, INSURANCE_BENCHMARK_MAX_ANNUAL_PREMIUM_DOLLARS, {
    required: BENCHMARK_FORM_PROBLEMS.premiumRequired,
    tooHigh: BENCHMARK_FORM_PROBLEMS.premiumTooHigh,
  });
  if (premium) problems.premium = premium;
  const coverage = moneyProblem(values.coverage, INSURANCE_BENCHMARK_MAX_COVERAGE_DOLLARS, {
    required: BENCHMARK_FORM_PROBLEMS.coverageRequired,
    tooHigh: BENCHMARK_FORM_PROBLEMS.coverageTooHigh,
  });
  if (coverage) problems.coverage = coverage;
  if (isTooLong(values.regionLabel, INSURANCE_BENCHMARK_REGION_MAX_LENGTH)) problems.regionLabel = BENCHMARK_FORM_PROBLEMS.regionTooLong;
  if (isTooLong(values.source, BENCHMARK_SOURCE_MAX_LENGTH)) problems.source = BENCHMARK_FORM_PROBLEMS.sourceTooLong;
  const observedOn = observedOnProblem(values.observedOn, today);
  if (observedOn) problems.observedOn = observedOn;
  if (isTooLong(values.notes, BENCHMARK_NOTES_MAX_LENGTH)) problems.notes = BENCHMARK_FORM_PROBLEMS.notesTooLong;
  return problems;
}

/** The request for a form with no problems, or null when it is not ready to send. */
export function benchmarkFormPayload(
  values: InsuranceBenchmarkFormValues,
  today: string,
): Omit<InsuranceBenchmarkUpsertRequest, "today"> | null {
  if (Object.keys(benchmarkFormProblems(values, today)).length > 0) return null;
  const premiumCents = positiveDollarsToCents(values.premium);
  const coverageCents = positiveDollarsToCents(values.coverage);
  if (premiumCents === null || coverageCents === null) return null;
  return {
    annual_premium_cents: premiumCents,
    coverage_amount_cents: coverageCents,
    region_label: textOrNull(values.regionLabel),
    source: textOrNull(values.source),
    observed_on: values.observedOn,
    notes: textOrNull(values.notes),
  };
}
