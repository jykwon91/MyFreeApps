import type { RentCharge } from "@mybookkeeper/api-client/types/rent/rent-charge";
import type { RentLedgerResponse } from "@mybookkeeper/api-client/types/rent/rent-ledger-response";
import type { RentPayment } from "@mybookkeeper/api-client/types/rent/rent-payment";
import type { RentPeriodSummary } from "@mybookkeeper/api-client/types/rent/rent-period-summary";
import type { RentSchedule } from "@mybookkeeper/api-client/types/rent/rent-schedule";

export function aRentLedger(overrides: Partial<RentLedgerResponse> = {}): RentLedgerResponse {
  return {
    applicant_id: "a1",
    as_of: "2026-03-10",
    schedules: [],
    charges: [],
    payments: [],
    current_period: null,
    total_charged: "0.00",
    total_paid: "0.00",
    balance: "0.00",
    unapplied_credit: "0.00",
    ...overrides,
  };
}

export function aRentSchedule(overrides: Partial<RentSchedule> = {}): RentSchedule {
  return {
    id: "s1",
    applicant_id: "a1",
    property_id: null,
    amount: "1500.00",
    cadence: "monthly",
    start_date: "2026-03-01",
    end_date: null,
    grace_days: 0,
    notes: null,
    created_at: "2026-03-01T12:00:00Z",
    updated_at: "2026-03-01T12:00:00Z",
    ...overrides,
  };
}

export function aRentCharge(overrides: Partial<RentCharge> = {}): RentCharge {
  return {
    id: "c1",
    schedule_id: "s1",
    charge_type: "rent",
    period_start: "2026-03-01",
    period_end: "2026-03-31",
    due_date: "2026-03-01",
    amount: "1500.00",
    full_amount: null,
    description: null,
    waived_at: null,
    waived_reason: null,
    allocated: "750.00",
    remaining: "750.00",
    status: "partial",
    applications: [],
    ...overrides,
  };
}

export function aRentPeriod(overrides: Partial<RentPeriodSummary> = {}): RentPeriodSummary {
  return {
    charge_id: "c1",
    label: "March 2026",
    period_start: "2026-03-01",
    period_end: "2026-03-31",
    amount: "1500.00",
    full_amount: null,
    allocated: "750.00",
    remaining: "750.00",
    status: "partial",
    ...overrides,
  };
}

export function aRentPayment(overrides: Partial<RentPayment> = {}): RentPayment {
  return {
    transaction_id: "t1",
    paid_on: "2026-03-04",
    amount: "750.00",
    payer_name: "Dana Reed",
    payment_method: null,
    unapplied: "0.00",
    applied_to: ["March 2026"],
    ...overrides,
  };
}
