import type { Company } from "@myjobhunter/api-client/types/company";

/** A company, named as a test needs. */
export function companyRecord(overrides: Partial<Company> & Pick<Company, "id" | "name">): Company {
  return {
    user_id: "u1",
    primary_domain: null,
    logo_url: null,
    industry: null,
    size_range: null,
    hq_location: null,
    description: null,
    external_ref: null,
    external_source: null,
    crunchbase_id: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}
