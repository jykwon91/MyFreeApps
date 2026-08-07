/**
 * Unit tests for the utility-plan form conversions.
 *
 * These functions are the only place a plan crosses between the API's shape
 * (integer cents, Decimal-as-string rates) and the form's (everything a
 * string). A rounding slip here misprices every comparison built on the row,
 * so the round trip is asserted field by field.
 */
import { describe, it, expect } from "vitest";
import {
  EMPTY_UTILITY_PLAN_FORM,
  toUtilityPlanFields,
  toUtilityPlanFormValues,
  validateUtilityPlanForm,
} from "@/shared/lib/utility-plan-form";
import type { UtilityPlanDetail } from "@/shared/types/utility/utility-plan-detail";

function makeDetail(overrides: Partial<UtilityPlanDetail> = {}): UtilityPlanDetail {
  return {
    id: "plan-a",
    user_id: "user-1",
    organization_id: "org-1",
    property_id: "prop-1",
    property_name: "6734 Peerless St",
    service_type: "electricity",
    provider_name: "Constellation",
    account_number: "204430810",
    plan_name: "FIXED Electricity Plan",
    rate_type: "fixed",
    energy_charge_cents_per_kwh: "11.6000",
    tdu_charge_cents_per_kwh: "5.3509",
    avg_price_cents_per_kwh_at_1000: "13.9000",
    monthly_base_charge_cents: 439,
    term_months: 12,
    service_start_date: "2025-01-23",
    term_end_date: "2026-01-23",
    early_termination_fee_cents: 15000,
    has_bill_credit: false,
    bill_credit_amount_cents: null,
    bill_credit_threshold_kwh: null,
    min_usage_fee_cents: 0,
    min_usage_threshold_kwh: 999,
    notes: "Account number unresolved — set it from a bill.",
    days_until_term_end: -196,
    renewal_status: "expired",
    is_current: true,
    created_at: "2025-01-23T00:00:00Z",
    updated_at: "2025-01-23T00:00:00Z",
    ...overrides,
  };
}

describe("toUtilityPlanFormValues", () => {
  it("prefills every editable field from a saved plan", () => {
    const values = toUtilityPlanFormValues(makeDetail());

    expect(values).toEqual({
      serviceType: "electricity",
      rateType: "fixed",
      providerName: "Constellation",
      planName: "FIXED Electricity Plan",
      accountNumber: "204430810",
      energyCharge: "11.6",
      tduCharge: "5.3509",
      avgPrice: "13.9",
      monthlyBase: "4.39",
      termMonths: "12",
      serviceStartDate: "2025-01-23",
      termEndDate: "2026-01-23",
      etf: "150.00",
      hasBillCredit: false,
      billCreditAmount: "",
      billCreditThreshold: "",
    });
  });

  it("keeps a sub-cent TDU rate intact rather than rounding to two places", () => {
    // 5.3509 rounded to 5.35 would misprice a year of delivery charges.
    const values = toUtilityPlanFormValues(makeDetail());
    expect(values.tduCharge).toBe("5.3509");
  });

  it("renders an absent optional field as blank, not as zero", () => {
    const values = toUtilityPlanFormValues(
      makeDetail({
        plan_name: null,
        account_number: null,
        energy_charge_cents_per_kwh: null,
        monthly_base_charge_cents: null,
        term_months: null,
        service_start_date: null,
        term_end_date: null,
        early_termination_fee_cents: null,
      }),
    );

    expect(values.planName).toBe("");
    expect(values.accountNumber).toBe("");
    expect(values.energyCharge).toBe("");
    expect(values.monthlyBase).toBe("");
    expect(values.termMonths).toBe("");
    expect(values.serviceStartDate).toBe("");
    expect(values.termEndDate).toBe("");
    expect(values.etf).toBe("");
  });

  it("prefills bill-credit terms when the plan has one", () => {
    const values = toUtilityPlanFormValues(
      makeDetail({
        has_bill_credit: true,
        bill_credit_amount_cents: 3500,
        bill_credit_threshold_kwh: 1000,
      }),
    );

    expect(values.hasBillCredit).toBe(true);
    expect(values.billCreditAmount).toBe("35.00");
    expect(values.billCreditThreshold).toBe("1000");
  });
});

describe("toUtilityPlanFields", () => {
  it("round-trips a saved plan back to the same values", () => {
    const plan = makeDetail();
    const payload = toUtilityPlanFields(toUtilityPlanFormValues(plan));

    expect(payload.provider_name).toBe(plan.provider_name);
    expect(payload.plan_name).toBe(plan.plan_name);
    expect(payload.account_number).toBe(plan.account_number);
    expect(payload.monthly_base_charge_cents).toBe(439);
    expect(payload.early_termination_fee_cents).toBe(15000);
    expect(payload.term_months).toBe(12);
    expect(payload.service_start_date).toBe("2025-01-23");
    expect(payload.term_end_date).toBe("2026-01-23");
  });

  it("sends rates as strings so precision survives the JSON boundary", () => {
    const payload = toUtilityPlanFields(toUtilityPlanFormValues(makeDetail()));

    expect(payload.tdu_charge_cents_per_kwh).toBe("5.3509");
    expect(typeof payload.tdu_charge_cents_per_kwh).toBe("string");
  });

  /**
   * The API applies exactly the keys it receives (``exclude_unset``). Emitting
   * these as null would erase the minimum-usage terms and the provenance note
   * the seeded plans carry, neither of which this form can edit.
   */
  it("omits the fields the form does not edit rather than nulling them", () => {
    const payload = toUtilityPlanFields(toUtilityPlanFormValues(makeDetail()));

    expect(payload).not.toHaveProperty("min_usage_fee_cents");
    expect(payload).not.toHaveProperty("min_usage_threshold_kwh");
    expect(payload).not.toHaveProperty("notes");
    expect(payload).not.toHaveProperty("property_id");
  });

  it("turns an untouched optional field into null, not an empty string", () => {
    const payload = toUtilityPlanFields(EMPTY_UTILITY_PLAN_FORM);

    expect(payload.plan_name).toBeNull();
    expect(payload.account_number).toBeNull();
    expect(payload.energy_charge_cents_per_kwh).toBeNull();
    expect(payload.monthly_base_charge_cents).toBeNull();
    expect(payload.term_months).toBeNull();
    expect(payload.service_start_date).toBeNull();
    expect(payload.term_end_date).toBeNull();
  });

  it("converts dollars to integer cents", () => {
    const payload = toUtilityPlanFields({
      ...EMPTY_UTILITY_PLAN_FORM,
      providerName: "Reliant",
      monthlyBase: "4.39",
      etf: "150",
    });

    expect(payload.monthly_base_charge_cents).toBe(439);
    expect(payload.early_termination_fee_cents).toBe(15000);
  });

  it("drops bill-credit figures when the credit is switched off", () => {
    // Otherwise unchecking the box would leave a credit amount on the row and
    // the backend would reject the half-recorded pair.
    const payload = toUtilityPlanFields({
      ...EMPTY_UTILITY_PLAN_FORM,
      providerName: "Reliant",
      hasBillCredit: false,
      billCreditAmount: "35",
      billCreditThreshold: "1000",
    });

    expect(payload.has_bill_credit).toBe(false);
    expect(payload.bill_credit_amount_cents).toBeNull();
    expect(payload.bill_credit_threshold_kwh).toBeNull();
  });

  it("trims surrounding whitespace off text fields", () => {
    const payload = toUtilityPlanFields({
      ...EMPTY_UTILITY_PLAN_FORM,
      providerName: "  Constellation  ",
      planName: "  12 Month Fixed  ",
    });

    expect(payload.provider_name).toBe("Constellation");
    expect(payload.plan_name).toBe("12 Month Fixed");
  });
});

describe("validateUtilityPlanForm", () => {
  it("accepts a form with only a provider", () => {
    expect(
      validateUtilityPlanForm({ ...EMPTY_UTILITY_PLAN_FORM, providerName: "Reliant" }),
    ).toBeNull();
  });

  it("rejects a blank provider", () => {
    expect(
      validateUtilityPlanForm({ ...EMPTY_UTILITY_PLAN_FORM, providerName: "   " }),
    ).toBe("Provider is required.");
  });

  it("rejects a half-recorded bill credit", () => {
    expect(
      validateUtilityPlanForm({
        ...EMPTY_UTILITY_PLAN_FORM,
        providerName: "Reliant",
        hasBillCredit: true,
        billCreditAmount: "35",
        billCreditThreshold: "",
      }),
    ).toBe("A bill credit needs both an amount and a usage threshold.");
  });
});
