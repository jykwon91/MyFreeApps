/**
 * TypeScript model for an ApplicationEvent as returned by the MJH backend.
 * Mirrors `ApplicationEventResponse` in
 * apps/myjobhunter/backend/app/schemas/application/application_event_response.py.
 */
import type { ApplicationEventSource } from "./application-event-source";
import type { ApplicationEventType } from "./application-event-type";
import type { InterviewDetails } from "./interview-details";

export interface ApplicationEvent {
  id: string;
  user_id: string;
  application_id: string;
  event_type: ApplicationEventType;
  occurred_at: string;
  source: ApplicationEventSource;
  email_message_id: string | null;
  raw_payload: Record<string, unknown> | null;
  interview_details: InterviewDetails | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}
