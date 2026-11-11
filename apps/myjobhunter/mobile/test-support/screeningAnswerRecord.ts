import type { ScreeningAnswer } from "@myjobhunter/api-client/types/screening-answer/screening-answer";

/** A screening answer on the profile, with whatever a test cares about changed. */
export function screeningAnswerRecord(overrides: Partial<ScreeningAnswer> & Pick<ScreeningAnswer, "id" | "question_key">): ScreeningAnswer {
  return {
    user_id: "u1",
    profile_id: "p1",
    answer: null,
    is_eeoc: overrides.question_key.startsWith("eeoc_"),
    created_at: "2026-10-21T00:00:00Z",
    updated_at: "2026-10-21T00:00:00Z",
    ...overrides,
  };
}
