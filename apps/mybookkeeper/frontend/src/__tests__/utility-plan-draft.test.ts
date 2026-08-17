import { describe, expect, it } from "vitest";
import { applyDraftToForm } from "@/shared/lib/utility-plan-draft";
import { EMPTY_UTILITY_PLAN_FORM } from "@/shared/lib/utility-plan-form";
import type { UtilityPlanDraft } from "@/shared/types/utility/utility-plan-draft";
import type { UtilityPlanFormValues } from "@/shared/types/utility/utility-plan-form-values";

function draft(overrides: Partial<UtilityPlanDraft> = {}): UtilityPlanDraft {
  return {
    source_document_id: "11111111-1111-1111-1111-111111111111",
    service_type: null,
    provider_name: null,
    plan_name: null,
    account_number: null,
    rate_type: null,
    energy_charge_cents_per_kwh: null,
    tdu_charge_cents_per_kwh: null,
    avg_price_cents_per_kwh_at_1000: null,
    monthly_base_charge_cents: null,
    term_months: null,
    service_start_date: null,
    term_end_date: null,
    early_termination_fee_cents: null,
    has_bill_credit: false,
    bill_credit_amount_cents: null,
    bill_credit_threshold_kwh: null,
    min_usage_fee_cents: null,
    min_usage_threshold_kwh: null,
    post_promo_monthly_cents: null,
    equipment_fee_monthly_cents: null,
    download_mbps: null,
    upload_mbps: null,
    data_cap_gb: null,
    notes: null,
    confidence: "low",
    warnings: [],
    unrepresented: [],
    ...overrides,
  };
}

const TYPED: UtilityPlanFormValues = {
  ...EMPTY_UTILITY_PLAN_FORM,
  providerName: "Constellation",
  accountNumber: "204430810",
};

describe("applyDraftToForm", () => {
  it("fills the fields the document stated", () => {
    const values = applyDraftToForm(
      EMPTY_UTILITY_PLAN_FORM,
      draft({
        service_type: "electricity",
        rate_type: "fixed",
        provider_name: "Constellation",
        energy_charge_cents_per_kwh: "14.1100",
        early_termination_fee_cents: 15000,
        term_end_date: "2027-02-17",
      }),
    );

    expect(values.providerName).toBe("Constellation");
    expect(values.energyCharge).toBe("14.11");
    expect(values.etf).toBe("150.00");
    expect(values.termEndDate).toBe("2027-02-17");
  });

  it("never blanks a field the operator already typed", () => {
    // The whole reason the overlay is a merge and not a replace: the document
    // is silent on the account number, and silence is not an instruction.
    const values = applyDraftToForm(TYPED, draft({ provider_name: "Reliant" }));

    expect(values.accountNumber).toBe("204430810");
    expect(values.providerName).toBe("Reliant");
  });

  it("keeps a bill credit the operator ticked even when the document is silent", () => {
    const values = applyDraftToForm(
      { ...EMPTY_UTILITY_PLAN_FORM, hasBillCredit: true },
      draft({ has_bill_credit: false }),
    );

    expect(values.hasBillCredit).toBe(true);
  });

  it("ticks the bill credit when the document states one", () => {
    const values = applyDraftToForm(
      EMPTY_UTILITY_PLAN_FORM,
      draft({
        has_bill_credit: true,
        bill_credit_amount_cents: 3500,
        bill_credit_threshold_kwh: 1000,
      }),
    );

    expect(values.hasBillCredit).toBe(true);
    expect(values.billCreditAmount).toBe("35.00");
    expect(values.billCreditThreshold).toBe("1000");
  });

  it("ignores a service or rate type outside the allowed values", () => {
    // The backend already drops these, so this is the second gate rather than
    // the only one — but a bad value here would land in a select as a phantom
    // option that silently fails to save.
    const values = applyDraftToForm(
      EMPTY_UTILITY_PLAN_FORM,
      draft({ service_type: "electric", rate_type: "fixed_rate" }),
    );

    expect(values.serviceType).toBe(EMPTY_UTILITY_PLAN_FORM.serviceType);
    expect(values.rateType).toBe(EMPTY_UTILITY_PLAN_FORM.rateType);
  });

  it("trims a padded rate so an untouched input doesn't look edited", () => {
    const values = applyDraftToForm(
      EMPTY_UTILITY_PLAN_FORM,
      draft({ tdu_charge_cents_per_kwh: "5.3509", avg_price_cents_per_kwh_at_1000: "10.0000" }),
    );

    expect(values.tduCharge).toBe("5.3509");
    expect(values.avgPrice).toBe("10");
  });

  it("keeps a stated zero rather than treating it as nothing read", () => {
    const values = applyDraftToForm(
      EMPTY_UTILITY_PLAN_FORM,
      draft({ monthly_base_charge_cents: 0 }),
    );

    expect(values.monthlyBase).toBe("0.00");
  });

  it("fills the minimum-usage terms the form now holds", () => {
    const values = applyDraftToForm(
      EMPTY_UTILITY_PLAN_FORM,
      draft({ min_usage_fee_cents: 995, min_usage_threshold_kwh: 1000 }),
    );

    expect(values.minUsageFee).toBe("9.95");
    expect(values.minUsageThreshold).toBe("1000");
  });

  it("fills the internet terms the form now holds", () => {
    const values = applyDraftToForm(
      EMPTY_UTILITY_PLAN_FORM,
      draft({
        service_type: "internet",
        post_promo_monthly_cents: 8999,
        equipment_fee_monthly_cents: 1500,
        download_mbps: 1000,
        upload_mbps: 35,
        data_cap_gb: 1200,
      }),
    );

    expect(values.serviceType).toBe("internet");
    expect(values.postPromoMonthly).toBe("89.99");
    expect(values.equipmentFeeMonthly).toBe("15.00");
    expect(values.downloadMbps).toBe("1000");
    expect(values.uploadMbps).toBe("35");
    expect(values.dataCapGb).toBe("1200");
  });
});
