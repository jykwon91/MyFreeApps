import type { InsurancePolicyDraft } from "@/shared/types/insurance/insurance-policy-draft";
import type { InsurancePolicyFormValues } from "@/shared/types/insurance/insurance-policy-form-values";
import { INSURANCE_PREMIUM_FREQUENCIES } from "@/shared/types/insurance/insurance-premium-frequency";
import type { InsurancePremiumFrequency } from "@/shared/types/insurance/insurance-premium-frequency";

/**
 * Turning a read declarations page into form state.
 *
 * Pure and separate from the dialog so the merge rule is testable on its own.
 * That rule is the whole point of this module: a draft only ever *fills* the
 * form, it never blanks it. The operator may have typed the policy number
 * before reaching for the document, and a field the dec page didn't state must
 * not erase it.
 */

/** Integer cents → the dollar string a money input expects: 240000 → ``"2400"``. */
function centsToDollarString(value: number | null): string | null {
  if (value === null) return null;
  return String(value / 100);
}

/**
 * ``"1.50"`` → ``"1.5"``, matching how a saved policy seeds the same input.
 *
 * A number input normalizes its own value on edit, so the padded form makes an
 * untouched field look dirty. The trimmed string is numerically identical.
 */
function pctToInputString(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : null;
}

function asFrequency(value: string | null): InsurancePremiumFrequency | null {
  return INSURANCE_PREMIUM_FREQUENCIES.includes(value as InsurancePremiumFrequency)
    ? (value as InsurancePremiumFrequency)
    : null;
}

/** Every field the form holds, as the draft would set it, or null to leave alone. */
function draftedFields(
  draft: InsurancePolicyDraft,
): Partial<InsurancePolicyFormValues> {
  const candidates: Partial<Record<keyof InsurancePolicyFormValues, unknown>> = {
    policyName: draft.policy_name,
    carrier: draft.carrier,
    policyNumber: draft.policy_number,
    effectiveDate: draft.effective_date,
    expirationDate: draft.expiration_date,
    coverageDollars: centsToDollarString(draft.coverage_amount_cents),
    premiumDollars: centsToDollarString(draft.premium_cents),
    premiumFrequency: asFrequency(draft.premium_frequency),
    feesAndTaxesDollars: centsToDollarString(draft.fees_and_taxes_cents),
    deductibleDollars: centsToDollarString(draft.deductible_cents),
    windHailPct: pctToInputString(draft.wind_hail_deductible_pct),
  };

  const set: Partial<InsurancePolicyFormValues> = {};
  for (const [key, value] of Object.entries(candidates)) {
    if (value !== null) {
      Object.assign(set, { [key]: value });
    }
  }
  return set;
}

/** Overlay a draft onto the current form values. */
export function applyDraftToForm(
  values: InsurancePolicyFormValues,
  draft: InsurancePolicyDraft,
): InsurancePolicyFormValues {
  return { ...values, ...draftedFields(draft) };
}

/*
 * ``notes`` is deliberately absent from the fields above.
 *
 * It is the one field the reader returns that the form must not fill: it is
 * where the operator keeps their own record of the policy, and overwriting that
 * with a model's summary would cost them something they wrote. It is not
 * dropped either — ``DocumentDraftNotices`` renders it, unedited, as the
 * reader's own account of the document.
 */
