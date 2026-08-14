import type { InsurancePolicyDetail } from "@/shared/types/insurance/insurance-policy-detail";
import type { InsurancePolicyFormValues } from "@/shared/types/insurance/insurance-policy-form-values";
import type { InsurancePremiumFrequency } from "@/shared/types/insurance/insurance-premium-frequency";

/**
 * Conversion between the insurance-policy form's text state and the API shape.
 *
 * Pure and shared by the add and edit dialogs so the two can never disagree on
 * what an empty field means or where the decimal point goes.
 */

export const EMPTY_POLICY_FORM: InsurancePolicyFormValues = {
  policyName: "",
  carrier: "",
  policyNumber: "",
  effectiveDate: "",
  expirationDate: "",
  coverageDollars: "",
  premiumDollars: "",
  premiumFrequency: "",
  feesAndTaxesDollars: "",
  deductibleDollars: "",
  windHailPct: "",
  notes: "",
};

/**
 * Dollars typed by hand → integer cents, or null when the field is blank.
 *
 * ``Number("")`` is 0, not NaN, so a blank field would otherwise post a real
 * zero — which for a premium means "free" and for a deductible means
 * "first-dollar coverage". Both are claims the operator did not make.
 */
export function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

/** A blank optional text field posts null rather than an empty string. */
function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The premium pair, or nulls.
 *
 * The backend rejects a half-set pair, so a frequency chosen without an amount
 * is dropped here rather than posted to fail — the picker defaults to a value
 * and a user who never touches the amount did not intend to record a premium.
 */
function premiumPair(values: InsurancePolicyFormValues): {
  premium_cents: number | null;
  premium_frequency: InsurancePremiumFrequency | null;
} {
  const cents = dollarsToCents(values.premiumDollars);
  if (cents === null || cents <= 0 || values.premiumFrequency === "") {
    return { premium_cents: null, premium_frequency: null };
  }
  return {
    premium_cents: cents,
    premium_frequency: values.premiumFrequency as InsurancePremiumFrequency,
  };
}

/** Form state → the field set both POST and PATCH accept. */
export function toPolicyPayload(values: InsurancePolicyFormValues) {
  return {
    policy_name: values.policyName.trim(),
    carrier: textOrNull(values.carrier),
    policy_number: textOrNull(values.policyNumber),
    effective_date: values.effectiveDate || null,
    expiration_date: values.expirationDate || null,
    coverage_amount_cents: dollarsToCents(values.coverageDollars),
    ...premiumPair(values),
    fees_and_taxes_cents: dollarsToCents(values.feesAndTaxesDollars),
    deductible_cents: dollarsToCents(values.deductibleDollars),
    wind_hail_deductible_pct: textOrNull(values.windHailPct),
    notes: textOrNull(values.notes),
  };
}

/** Cents → the dollars string the form shows, blank when unrecorded. */
function centsToDollars(cents: number | null): string {
  return cents === null ? "" : String(cents / 100);
}

/** A stored policy → the form state that edits it. */
export function policyToFormValues(
  policy: InsurancePolicyDetail,
): InsurancePolicyFormValues {
  return {
    policyName: policy.policy_name,
    carrier: policy.carrier ?? "",
    policyNumber: policy.policy_number ?? "",
    effectiveDate: policy.effective_date ?? "",
    expirationDate: policy.expiration_date ?? "",
    coverageDollars: centsToDollars(policy.coverage_amount_cents),
    premiumDollars: centsToDollars(policy.premium_cents),
    premiumFrequency: policy.premium_frequency ?? "",
    feesAndTaxesDollars: centsToDollars(policy.fees_and_taxes_cents),
    deductibleDollars: centsToDollars(policy.deductible_cents),
    windHailPct: policy.wind_hail_deductible_pct ?? "",
    notes: policy.notes ?? "",
  };
}
