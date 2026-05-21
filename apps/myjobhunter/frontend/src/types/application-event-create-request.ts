import type { ApplicationEventType, ApplicationEventSource } from "./application-event";
import type { InterviewDetails } from "./interview-details";

/**
 * Body for POST /applications/{id}/events. Mirrors `ApplicationEventCreateRequest`
 * in apps/myjobhunter/backend/app/schemas/application/application_event_create_request.py.
 *
 * `interview_details` is only valid when `event_type` is `interview_scheduled`
 * or `interview_completed`; the backend rejects other combinations with 422.
 */
export interface ApplicationEventCreateRequest {
  event_type: ApplicationEventType;
  occurred_at: string;
  source?: ApplicationEventSource;
  note?: string | null;
  interview_details?: InterviewDetails | null;
}
