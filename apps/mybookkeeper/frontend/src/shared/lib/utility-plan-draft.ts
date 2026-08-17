import type { UtilityPlanDraft } from "@/shared/types/utility/utility-plan-draft";
import type { UtilityPlanFormValues } from "@/shared/types/utility/utility-plan-form-values";
import { UTILITY_PLAN_RATE_TYPES } from "@/shared/types/utility/utility-plan-rate-type";
import type { UtilityPlanRateType } from "@/shared/types/utility/utility-plan-rate-type";
import { UTILITY_SERVICE_TYPES } from "@/shared/types/utility/utility-service-type";
import type { UtilityServiceType } from "@/shared/types/utility/utility-service-type";

/**
 * Turning a read document into form state.
 *
 * Pure and separate from the dialog so the merge rule is testable on its own.
 * That rule is the whole point of this module: a draft only ever *fills* the
 * form, it never blanks it. The operator may have typed the account number
 * before reaching for the document, and a field the document didn't state must
 * not erase it.
 */

/** Integer cents → the dollar string a money input expects: 439 → ``"4.39"``. */
function centsToDollarString(value: number | null): string | null {
  if (value === null) return null;
  return (value / 100).toFixed(2);
}

/**
 * ``"11.6000"`` → ``"11.6"``, matching how a saved plan seeds the same input.
 *
 * A number input normalizes its own value on edit, so the padded form makes an
 * untouched field look dirty. The trimmed string is numerically identical.
 */
function rateToInputString(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : null;
}

function intToInputString(value: number | null): string | null {
  return value === null ? null : String(value);
}

function asServiceType(value: string | null): UtilityServiceType | null {
  return UTILITY_SERVICE_TYPES.includes(value as UtilityServiceType)
    ? (value as UtilityServiceType)
    : null;
}

function asRateType(value: string | null): UtilityPlanRateType | null {
  return UTILITY_PLAN_RATE_TYPES.includes(value as UtilityPlanRateType)
    ? (value as UtilityPlanRateType)
    : null;
}

/** Every field the form holds, as the draft would set it, or null to leave alone. */
function draftedFields(draft: UtilityPlanDraft): Partial<UtilityPlanFormValues> {
  const candidates: Partial<Record<keyof UtilityPlanFormValues, unknown>> = {
    serviceType: asServiceType(draft.service_type),
    rateType: asRateType(draft.rate_type),
    providerName: draft.provider_name,
    planName: draft.plan_name,
    accountNumber: draft.account_number,
    energyCharge: rateToInputString(draft.energy_charge_cents_per_kwh),
    tduCharge: rateToInputString(draft.tdu_charge_cents_per_kwh),
    avgPrice: rateToInputString(draft.avg_price_cents_per_kwh_at_1000),
    monthlyBase: centsToDollarString(draft.monthly_base_charge_cents),
    termMonths: intToInputString(draft.term_months),
    serviceStartDate: draft.service_start_date,
    termEndDate: draft.term_end_date,
    etf: centsToDollarString(draft.early_termination_fee_cents),
    billCreditAmount: centsToDollarString(draft.bill_credit_amount_cents),
    billCreditThreshold: intToInputString(draft.bill_credit_threshold_kwh),
    minUsageFee: centsToDollarString(draft.min_usage_fee_cents),
    minUsageThreshold: intToInputString(draft.min_usage_threshold_kwh),
    postPromoMonthly: centsToDollarString(draft.post_promo_monthly_cents),
    equipmentFeeMonthly: centsToDollarString(draft.equipment_fee_monthly_cents),
    downloadMbps: intToInputString(draft.download_mbps),
    uploadMbps: intToInputString(draft.upload_mbps),
    dataCapGb: intToInputString(draft.data_cap_gb),
  };

  const set: Partial<UtilityPlanFormValues> = {};
  for (const [key, value] of Object.entries(candidates)) {
    if (value !== null) {
      Object.assign(set, { [key]: value });
    }
  }
  return set;
}

/**
 * Overlay a draft onto the current form values.
 *
 * ``has_bill_credit`` is the one field taken unconditionally: it is a boolean
 * with no "unknown" state, and the backend only reports true when the document
 * actually said so.
 */
export function applyDraftToForm(
  values: UtilityPlanFormValues,
  draft: UtilityPlanDraft,
): UtilityPlanFormValues {
  return {
    ...values,
    ...draftedFields(draft),
    hasBillCredit: values.hasBillCredit || draft.has_bill_credit,
  };
}

/*
 * ``notes`` is deliberately absent from the fields above.
 *
 * ``PATCH`` applies exactly the keys it is sent, and filling notes here would
 * erase the provenance line the seeded plans carry. It is not dropped either —
 * ``DocumentDraftNotices`` renders it, unedited, as the reader's own account of
 * the document.
 */
