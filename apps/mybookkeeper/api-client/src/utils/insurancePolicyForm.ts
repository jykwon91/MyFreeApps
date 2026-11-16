import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import type { InsurancePolicyDetail } from "../types/insurance/insurance-policy-detail";
import type { InsurancePolicyFormValues } from "../types/insurance/insurance-policy-form-values";
import type { InsurancePremiumFrequency } from "../types/insurance/insurance-premium-frequency";
import { WIND_HAIL_MAX_DECIMALS } from "../constants/insurancePolicyFieldLimits";
import { moneyTextToCents } from "./moneyTextToCents";
import { normalizeDecimalText } from "./normalizeDecimalText";

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

/** A blank optional text field posts null rather than an empty string. */
function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * True when a premium is entered but not how often it is billed.
 *
 * The one place that decides this, so the add and edit forms on the web and the
 * phone can't disagree. A monthly premium read as annual understates the yearly
 * cost by 12x, so the form must be stopped and the person asked, never guessed for.
 */
export function isPremiumBilledMissing(values: InsurancePolicyFormValues, decimalSeparator: DecimalSeparator): boolean {
  const cents = moneyTextToCents(values.premiumDollars, decimalSeparator);
  return typeof cents === "number" && cents > 0 && values.premiumFrequency === "";
}

/**
 * The premium pair, or nulls.
 *
 * The backend rejects a half-set pair. A frequency left on with no amount is
 * dropped, since there is no premium to bill. An amount with no frequency never
 * reaches here: ``isPremiumBilledMissing`` stops the form first.
 */
function premiumPair(values: InsurancePolicyFormValues, decimalSeparator: DecimalSeparator): {
  premium_cents: number | null;
  premium_frequency: InsurancePremiumFrequency | null;
} {
  const cents = moneyTextToCents(values.premiumDollars, decimalSeparator);
  if (typeof cents !== "number" || cents <= 0 || values.premiumFrequency === "") {
    return { premium_cents: null, premium_frequency: null };
  }
  return {
    premium_cents: cents,
    premium_frequency: values.premiumFrequency as InsurancePremiumFrequency,
  };
}

/** Form state → the field set both POST and PATCH accept. */
export function toPolicyPayload(values: InsurancePolicyFormValues, decimalSeparator: DecimalSeparator) {
  return {
    policy_name: values.policyName.trim(),
    carrier: textOrNull(values.carrier),
    policy_number: textOrNull(values.policyNumber),
    effective_date: values.effectiveDate || null,
    expiration_date: values.expirationDate || null,
    coverage_amount_cents: moneyTextToCents(values.coverageDollars, decimalSeparator) ?? null,
    ...premiumPair(values, decimalSeparator),
    fees_and_taxes_cents: moneyTextToCents(values.feesAndTaxesDollars, decimalSeparator) ?? null,
    deductible_cents: moneyTextToCents(values.deductibleDollars, decimalSeparator) ?? null,
    // Blank, or text the form check already refused, is no percentage rather than a guessed one.
    wind_hail_deductible_pct: normalizeDecimalText(values.windHailPct, decimalSeparator, WIND_HAIL_MAX_DECIMALS) || null,
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
