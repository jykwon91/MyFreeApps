import type { UtilityPlanDetail } from "@/shared/types/utility/utility-plan-detail";
import type { UtilityPlanFieldsPayload } from "@/shared/types/utility/utility-plan-fields-payload";
import type { UtilityPlanFormValues } from "@/shared/types/utility/utility-plan-form-values";

/**
 * Conversions between a utility plan and the form that edits it.
 *
 * Kept pure and separate from the dialogs so both the add and the edit flow
 * produce byte-identical payloads from the same field values — a rate that
 * survives creation must survive an edit too.
 */

/** A blank form. Electricity/fixed is the case the operator records most. */
export const EMPTY_UTILITY_PLAN_FORM: UtilityPlanFormValues = {
  serviceType: "electricity",
  rateType: "fixed",
  providerName: "",
  planName: "",
  accountNumber: "",
  energyCharge: "",
  tduCharge: "",
  avgPrice: "",
  monthlyBase: "",
  termMonths: "",
  serviceStartDate: "",
  termEndDate: "",
  etf: "",
  hasBillCredit: false,
  billCreditAmount: "",
  billCreditThreshold: "",
  minUsageFee: "",
  minUsageThreshold: "",
  postPromoMonthly: "",
  equipmentFeeMonthly: "",
  downloadMbps: "",
  uploadMbps: "",
  dataCapGb: "",
};

/** ``""`` → null so an untouched field is absent rather than zero. */
function optionalText(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

/**
 * Dollars → integer cents. Kept separate from the rate fields, which are sent
 * as strings: a rate carries four decimal places and must not round-trip
 * through a float.
 */
function dollarsToCents(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function toInt(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/** Integer cents → the dollar string a money input expects: 439 → ``"4.39"``. */
function centsToDollarString(value: number | null): string {
  if (value === null) return "";
  return (value / 100).toFixed(2);
}

function intToInputString(value: number | null): string {
  return value === null ? "" : String(value);
}

/**
 * ``"11.6000"`` → ``"11.6"``.
 *
 * A number input normalizes its own value on edit, so seeding it with the
 * padded form makes an untouched field look dirty. The trimmed string is
 * numerically identical, and the backend's four-decimal limit is a maximum.
 */
function rateToInputString(value: string | null): string {
  if (value === null || value.trim() === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

/** Prefill the form from a saved plan. */
export function toUtilityPlanFormValues(plan: UtilityPlanDetail): UtilityPlanFormValues {
  return {
    serviceType: plan.service_type,
    rateType: plan.rate_type,
    providerName: plan.provider_name,
    planName: plan.plan_name ?? "",
    accountNumber: plan.account_number ?? "",
    energyCharge: rateToInputString(plan.energy_charge_cents_per_kwh),
    tduCharge: rateToInputString(plan.tdu_charge_cents_per_kwh),
    avgPrice: rateToInputString(plan.avg_price_cents_per_kwh_at_1000),
    monthlyBase: centsToDollarString(plan.monthly_base_charge_cents),
    termMonths: intToInputString(plan.term_months),
    serviceStartDate: plan.service_start_date ?? "",
    termEndDate: plan.term_end_date ?? "",
    etf: centsToDollarString(plan.early_termination_fee_cents),
    hasBillCredit: plan.has_bill_credit,
    billCreditAmount: centsToDollarString(plan.bill_credit_amount_cents),
    billCreditThreshold: intToInputString(plan.bill_credit_threshold_kwh),
    minUsageFee: centsToDollarString(plan.min_usage_fee_cents),
    minUsageThreshold: intToInputString(plan.min_usage_threshold_kwh),
    postPromoMonthly: centsToDollarString(plan.post_promo_monthly_cents),
    equipmentFeeMonthly: centsToDollarString(plan.equipment_fee_monthly_cents),
    downloadMbps: intToInputString(plan.download_mbps),
    uploadMbps: intToInputString(plan.upload_mbps),
    dataCapGb: intToInputString(plan.data_cap_gb),
  };
}

/** The fields both requests share, as the API wants them. */
export function toUtilityPlanFields(
  values: UtilityPlanFormValues,
): UtilityPlanFieldsPayload {
  return {
    service_type: values.serviceType,
    rate_type: values.rateType,
    provider_name: values.providerName.trim(),
    plan_name: optionalText(values.planName),
    account_number: optionalText(values.accountNumber),
    // Rates stay strings end-to-end so 5.3509 survives intact.
    energy_charge_cents_per_kwh: optionalText(values.energyCharge),
    tdu_charge_cents_per_kwh: optionalText(values.tduCharge),
    avg_price_cents_per_kwh_at_1000: optionalText(values.avgPrice),
    monthly_base_charge_cents: dollarsToCents(values.monthlyBase),
    term_months: toInt(values.termMonths),
    service_start_date: values.serviceStartDate || null,
    term_end_date: values.termEndDate || null,
    early_termination_fee_cents: dollarsToCents(values.etf),
    has_bill_credit: values.hasBillCredit,
    bill_credit_amount_cents: values.hasBillCredit
      ? dollarsToCents(values.billCreditAmount)
      : null,
    bill_credit_threshold_kwh: values.hasBillCredit
      ? toInt(values.billCreditThreshold)
      : null,
    min_usage_fee_cents: dollarsToCents(values.minUsageFee),
    min_usage_threshold_kwh: toInt(values.minUsageThreshold),
    // Sent whatever the service type is, unlike the bill-credit pair above.
    // That pair MUST be dropped when its toggle is off or the row violates
    // ``chk_utility_plan_bill_credit_complete``; these have no such constraint,
    // so gating them on the service type would silently erase an internet
    // plan's speeds the moment someone corrected its service to electricity.
    // The inputs are hidden for services they don't describe, not cleared.
    post_promo_monthly_cents: dollarsToCents(values.postPromoMonthly),
    equipment_fee_monthly_cents: dollarsToCents(values.equipmentFeeMonthly),
    download_mbps: toInt(values.downloadMbps),
    upload_mbps: toInt(values.uploadMbps),
    data_cap_gb: toInt(values.dataCapGb),
  };
}

/**
 * Client-side guard, returning the message to show or null when the form is
 * submittable. The backend rejects the same shapes; catching them here points
 * at the field instead of costing a round trip.
 */
export function validateUtilityPlanForm(values: UtilityPlanFormValues): string | null {
  if (!values.providerName.trim()) return "Provider is required.";
  if (
    values.hasBillCredit &&
    (values.billCreditAmount.trim() === "" || values.billCreditThreshold.trim() === "")
  ) {
    return "A bill credit needs both an amount and a usage threshold.";
  }
  // A price step with no date is one the renewal alert cannot announce, so the
  // table rejects it outright (``chk_utility_plan_post_promo_needs_term_end``).
  if (values.postPromoMonthly.trim() !== "" && values.termEndDate === "") {
    return "A post-promo price needs the date the promo ends.";
  }
  // Zero is not a speed or a cap — it means "not recorded", which blank
  // already says. The table keeps the two distinct by rejecting zero.
  if ([values.downloadMbps, values.uploadMbps, values.dataCapGb].some(isNotPositive)) {
    return "Speeds and data caps must be more than zero.";
  }
  return null;
}

/** True for a filled-in field that parses to zero or less. Blank is fine. */
function isNotPositive(value: string): boolean {
  const parsed = toInt(value);
  return parsed !== null && parsed <= 0;
}
