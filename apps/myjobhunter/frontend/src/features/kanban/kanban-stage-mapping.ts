/**
 * Map an ``ApplicationEvent.event_type`` to the kanban column the card
 * should render in.
 *
 * The frontend mirrors the backend's column mapping so a freshly-loaded
 * board (no transition yet) and a board that's been mutated locally land
 * on the same column.
 *
 * Activity events (``note_added``, ``email_received``, ``follow_up_sent``)
 * never appear here — the backend filters them out of the lateral subquery
 * that powers ``latest_event_type``.
 */
import type { KanbanColumn } from "@/types/kanban/kanban-column";

const EVENT_TYPE_TO_COLUMN: Record<string, KanbanColumn> = {
  applied: "applied",
  interview_scheduled: "interviewing",
  interview_completed: "interviewing",
  offer_received: "offer",
  rejected: "closed",
  withdrawn: "closed",
  ghosted: "closed",
};

/**
 * Convert a stage-defining event_type into a kanban column id.
 * ``null`` (no stage events) -> "applied" (legacy data).
 * Unknown event types (forward-compatible) -> "applied".
 */
export function columnForEventType(eventType: string | null): KanbanColumn {
  if (eventType === null) return "applied";
  return EVENT_TYPE_TO_COLUMN[eventType] ?? "applied";
}
