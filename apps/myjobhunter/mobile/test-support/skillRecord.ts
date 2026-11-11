import type { Skill } from "@myjobhunter/api-client/types/skill/skill";

/** A skill on the profile, with whatever a test cares about changed. */
export function skillRecord(overrides: Partial<Skill> & Pick<Skill, "id" | "name">): Skill {
  return {
    user_id: "u1",
    profile_id: "p1",
    years_experience: null,
    category: null,
    created_at: "2026-10-21T00:00:00Z",
    updated_at: "2026-10-21T00:00:00Z",
    ...overrides,
  };
}
