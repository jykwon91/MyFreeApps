import type { InquiryEventActor } from "./inquiry-event-actor";

/**
 * Mirrors backend ``InquiryEventResponse``.
 *
 * ``event_type`` is the stage transitioned-into (or ``"received"`` for the
 * seed event). Append-only — events are never updated, only inserted.
 */
export interface InquiryEvent {
  id: string;
  inquiry_id: string;
  event_type: string;
  actor: InquiryEventActor;
  notes: string | null;
  occurred_at: string;
  created_at: string;
}
