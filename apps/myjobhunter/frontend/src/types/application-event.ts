/**
 * TypeScript model for an ApplicationEvent as returned by the MJH backend.
 * Mirrors `ApplicationEventResponse` in
 * apps/myjobhunter/backend/app/schemas/application/application_event_response.py.
 */
export type ApplicationEventType =
  | "applied"
  | "email_received"
  | "interview_scheduled"
  | "interview_completed"
  | "rejected"
  | "offer_received"
  | "withdrawn"
  | "ghosted"
  | "note_added"
  | "follow_up_sent";

export type ApplicationEventSource =
  | "manual"
  | "gmail"
  | "calendar"
  | "extension"
  | "system";

export interface ApplicationEvent {
  id: string;
  user_id: string;
  application_id: string;
  event_type: ApplicationEventType;
  occurred_at: string;
  source: ApplicationEventSource;
  email_message_id: string | null;
  raw_payload: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
}
