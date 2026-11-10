import { INTERVIEW_EVENT_TYPES } from "../constants/interviewEventTypes";
import type { ApplicationEventCreateRequest } from "../types/application-event-create-request";
import type { LogEventFormValues } from "../types/log-event-form-values";
import { buildInterviewDetails } from "./interviewEventForm";

/**
 * The POST /applications/{id}/events body for a hand-logged event. The local
 * wall-clock time becomes a UTC ISO string so the backend stores a tz-aware
 * moment; interview details go only with interview events (others get a 422).
 */
export function logEventRequest(values: LogEventFormValues): ApplicationEventCreateRequest {
  return {
    event_type: values.event_type,
    occurred_at: new Date(values.occurred_at).toISOString(),
    source: "manual",
    note: values.note.trim() || null,
    interview_details: INTERVIEW_EVENT_TYPES.has(values.event_type) ? buildInterviewDetails(values) : null,
  };
}
