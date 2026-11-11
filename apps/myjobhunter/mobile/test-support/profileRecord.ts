import type { Profile } from "@myjobhunter/api-client/types/profile/profile";

/** A profile, with whatever a test cares about changed. */
export function profileRecord(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "p1",
    user_id: "u1",
    resume_file_path: null,
    parser_version: null,
    parsed_at: null,
    work_auth_status: "unknown",
    desired_salary_min: null,
    desired_salary_max: null,
    salary_currency: "USD",
    salary_period: "annual",
    locations: [],
    remote_preference: "any",
    seniority: null,
    summary: null,
    timezone: null,
    discovery_defaults: {},
    created_at: "2026-10-21T00:00:00Z",
    updated_at: "2026-10-21T00:00:00Z",
    ...overrides,
  };
}
