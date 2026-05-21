import type { InterviewDetails } from "./interview-details";

/**
 * Body for PATCH /applications/{id}/events/{event_id}. Mirrors
 * `ApplicationEventUpdateRequest` in
 * apps/myjobhunter/backend/app/schemas/application/application_event_update_request.py.
 *
 * Only the two user-input columns are editable; every other event
 * field is structurally immutable (backend rejects extras with 422).
 *
 * Field omission semantics: omitting a key leaves the column untouched;
 * sending `null` clears the column. Mirrors `exclude_unset=True` on
 * the backend Pydantic model.
 *
 * Backend additionally enforces that the targeted event's event_type
 * is `interview_scheduled` or `interview_completed` — non-interview
 * events return 422 with detail `event_type does not support editing`.
 */
export interface ApplicationEventUpdateRequest {
  interview_details?: InterviewDetails | null;
  note?: string | null;
}
