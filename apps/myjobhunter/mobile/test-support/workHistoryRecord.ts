import type { WorkHistory } from "@myjobhunter/api-client/types/work-history/work-history";

/** A role on the profile, with whatever a test cares about changed. */
export function workHistoryRecord(overrides: Partial<WorkHistory> & Pick<WorkHistory, "id">): WorkHistory {
  return {
    user_id: "u1",
    profile_id: "p1",
    company_name: "Acme Corp",
    title: "Engineer",
    start_date: "2020-03-01",
    end_date: null,
    is_current: false,
    bullets: [],
    created_at: "2026-10-21T00:00:00Z",
    updated_at: "2026-10-21T00:00:00Z",
    ...overrides,
  };
}
