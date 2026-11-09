import type { InsuranceBenchmark } from "../types/insurance/insurance-benchmark";
import type { InsuranceBenchmarkFormValues } from "../types/insurance/insurance-benchmark-form-values";
import type { InsuranceBenchmarkUpsertRequest } from "../types/insurance/insurance-benchmark-upsert-request";

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

/**
 * Both figures are required, and deliberately so: the comparison runs on
 * premium per $1,000 of coverage, so a premium with no coverage behind it
 * cannot be normalised. Null means the form is not ready to send.
 */
export function benchmarkFormPayload(
  values: InsuranceBenchmarkFormValues,
): Omit<InsuranceBenchmarkUpsertRequest, "today"> | null {
  const premiumCents = positiveDollarsToCents(values.premium);
  const coverageCents = positiveDollarsToCents(values.coverage);
  if (premiumCents === null || coverageCents === null || values.observedOn === "") return null;
  return {
    annual_premium_cents: premiumCents,
    coverage_amount_cents: coverageCents,
    region_label: textOrNull(values.regionLabel),
    source: textOrNull(values.source),
    observed_on: values.observedOn,
    notes: textOrNull(values.notes),
  };
}
