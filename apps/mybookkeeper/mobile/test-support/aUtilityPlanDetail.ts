import type { UtilityPlanDetail } from "@mybookkeeper/api-client/types/utility/utility-plan-detail";
import { aUtilityPlanSummary } from "./aUtilityPlanSummary";

export function aUtilityPlanDetail(overrides: Partial<UtilityPlanDetail> = {}): UtilityPlanDetail {
  return {
    ...aUtilityPlanSummary(),
    user_id: "o",
    organization_id: "o",
    account_number: "1234564944",
    energy_charge_cents_per_kwh: "8.5000",
    tdu_charge_cents_per_kwh: "5.3509",
    monthly_base_charge_cents: 495,
    term_months: 12,
    service_start_date: "2026-01-15",
    early_termination_fee_cents: 15_000,
    has_bill_credit: true,
    bill_credit_amount_cents: 10_000,
    bill_credit_threshold_kwh: 1000,
    min_usage_fee_cents: 995,
    min_usage_threshold_kwh: 500,
    post_promo_monthly_cents: null,
    equipment_fee_monthly_cents: null,
    download_mbps: null,
    upload_mbps: null,
    data_cap_gb: null,
    source_document_id: null,
    notes: "Autopay on",
    ...overrides,
  };
}
