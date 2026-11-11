import type { CompanyResearch } from "@myjobhunter/api-client/types/company-research";

/** A company's research as GET /companies/{id}/research answers it, with whatever a test cares about changed. */
export function researchRecord(overrides: Partial<CompanyResearch> & Pick<CompanyResearch, "company_id">): CompanyResearch {
  return {
    id: `r-${overrides.company_id}`,
    user_id: "u1",
    overall_sentiment: "unknown",
    senior_engineer_sentiment: null,
    interview_process: null,
    description: null,
    products_for_you: null,
    red_flags: [],
    green_flags: [],
    reported_comp_range_min: null,
    reported_comp_range_max: null,
    comp_currency: "USD",
    comp_confidence: "low",
    raw_synthesis: null,
    last_researched_at: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    sources: [],
    ...overrides,
  };
}
