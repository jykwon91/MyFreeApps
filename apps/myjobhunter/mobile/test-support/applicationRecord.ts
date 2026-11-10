import type { Application } from "@myjobhunter/api-client/types/application";

/** An application as GET /applications lists it, with whatever a test cares about changed. */
export function applicationRecord(overrides: Partial<Application> & Pick<Application, "id">): Application {
  return {
    user_id: "u1",
    company_id: `c-${overrides.id}`,
    role_title: "Software Engineer",
    url: null,
    jd_text: null,
    jd_parsed: null,
    source: null,
    applied_at: null,
    posted_salary_min: null,
    posted_salary_max: null,
    posted_salary_currency: "USD",
    posted_salary_period: null,
    location: null,
    remote_type: "unknown",
    fit_score: null,
    notes: null,
    archived: false,
    external_ref: null,
    external_source: null,
    latest_status: null,
    company_name: "Acme",
    deleted_at: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}
