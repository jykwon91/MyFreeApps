import type { ApplicantEventActor } from "./applicant-event-actor";

/**
 * Mirrors backend ``ApplicantEventResponse``. Append-only — no ``updated_at``.
 */
export interface ApplicantEvent {
  id: string;
  applicant_id: string;
  event_type: string;
  actor: ApplicantEventActor;
  notes: string | null;
  payload: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
}
