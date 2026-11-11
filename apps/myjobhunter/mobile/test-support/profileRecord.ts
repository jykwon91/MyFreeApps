import type { Profile } from "@myjobhunter/api-client/types/profile/profile";

/** A profile with a parsed resume and no discovery defaults, unless a test says otherwise. */
export function profileRecord(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "p1",
    user_id: "u1",
    resume_file_path: "resumes/me.pdf",
    parser_version: null,
    parsed_at: null,
    work_auth_status: "citizen",
    desired_salary_min: null,
    desired_salary_max: null,
    salary_currency: "USD",
    salary_period: "year",
    locations: [],
    remote_preference: "no_preference",
    seniority: null,
    summary: null,
    timezone: null,
    discovery_defaults: {},
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}
