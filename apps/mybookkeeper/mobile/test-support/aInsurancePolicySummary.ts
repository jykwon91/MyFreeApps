import type { InsurancePolicySummary } from "@mybookkeeper/api-client/types/insurance/insurance-policy-summary";

export function aInsurancePolicySummary(overrides: Partial<InsurancePolicySummary> = {}): InsurancePolicySummary {
  return {
    id: "p1",
    property_id: "pr1",
    property_name: "Oak Street",
    policy_name: "Landlord policy",
    carrier: "Acme Mutual",
    effective_date: "2099-01-01",
    expiration_date: "2099-06-30",
    coverage_amount_cents: 50_000_000,
    premium_cents: 11_200,
    premium_frequency: "monthly",
    fees_and_taxes_cents: null,
    deductible_cents: 250_000,
    wind_hail_deductible_pct: "2.00",
    annual_premium_cents: 134_400,
    annual_total_cents: 134_400,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}
