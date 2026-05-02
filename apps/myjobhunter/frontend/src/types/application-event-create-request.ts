import type { ApplicationEventType, ApplicationEventSource } from "./application-event";

/**
 * Body for POST /applications/{id}/events. Mirrors `ApplicationEventCreateRequest`
 * in apps/myjobhunter/backend/app/schemas/application/application_event_create_request.py.
 */
export interface ApplicationEventCreateRequest {
  event_type: ApplicationEventType;
  occurred_at: string;
  source?: ApplicationEventSource;
  note?: string | null;
}
