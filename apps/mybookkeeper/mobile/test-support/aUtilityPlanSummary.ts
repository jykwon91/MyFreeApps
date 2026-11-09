import type { UtilityPlanSummary } from "@mybookkeeper/api-client/types/utility/utility-plan-summary";

export function aUtilityPlanSummary(overrides: Partial<UtilityPlanSummary> = {}): UtilityPlanSummary {
  return {
    id: "u1",
    property_id: "pr1",
    property_name: "Oak Street",
    service_type: "electricity",
    provider_name: "Reliant",
    plan_name: "Secure 12",
    rate_type: "fixed",
    avg_price_cents_per_kwh_at_1000: "13.9000",
    term_end_date: "2099-06-30",
    days_until_term_end: 9000,
    renewal_status: "active",
    is_current: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}
