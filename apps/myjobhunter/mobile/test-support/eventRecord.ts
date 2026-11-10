import type { ApplicationEvent } from "@myjobhunter/api-client/types/application-event";

/** A timeline event, with whatever a test cares about changed. */
export function eventRecord(overrides: Partial<ApplicationEvent> & Pick<ApplicationEvent, "id" | "application_id" | "event_type">): ApplicationEvent {
  return {
    user_id: "u1",
    occurred_at: "2026-10-20T15:30:00Z",
    source: "manual",
    email_message_id: null,
    raw_payload: null,
    interview_details: null,
    note: null,
    created_at: "2026-10-20T15:30:00Z",
    updated_at: "2026-10-20T15:30:00Z",
    ...overrides,
  };
}
