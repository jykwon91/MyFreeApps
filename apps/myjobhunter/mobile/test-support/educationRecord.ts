import type { Education } from "@myjobhunter/api-client/types/education/education";

/** A school on the profile, with whatever a test cares about changed. */
export function educationRecord(overrides: Partial<Education> & Pick<Education, "id">): Education {
  return {
    user_id: "u1",
    profile_id: "p1",
    school: "State University",
    degree: null,
    field: null,
    start_year: null,
    end_year: null,
    gpa: null,
    created_at: "2026-10-21T00:00:00Z",
    updated_at: "2026-10-21T00:00:00Z",
    ...overrides,
  };
}
