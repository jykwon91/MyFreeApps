/**
 * Structured interview metadata stored on application_events.
 *
 * Mirrors `InterviewDetailsRequest` and the JSONB `interview_details` column
 * in apps/myjobhunter/backend/app/schemas/application/application_event_create_request.py
 * and apps/myjobhunter/backend/app/models/application/application_event.py.
 *
 * `type` is the only required field; the rest are best-effort metadata the
 * operator may not yet know at logging time.
 */
export type InterviewType = "phone" | "video" | "onsite" | "panel";

export interface InterviewDetails {
  type: InterviewType;
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  location_or_link?: string | null;
  interviewer_names?: string[] | null;
}
