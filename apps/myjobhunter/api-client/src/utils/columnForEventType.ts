import { EVENT_TYPE_TO_COLUMN } from "../constants/eventTypeColumns";
import type { KanbanColumn } from "../types/kanban/kanban-column";
import { isStageDefiningEventType } from "./isStageDefiningEventType";

/**
 * Convert a stage-defining event_type into a kanban column id.
 * ``null`` (no stage events) -> "applied" (legacy data).
 * Unknown or activity event types (forward-compatible) -> "applied".
 */
export function columnForEventType(eventType: string | null): KanbanColumn {
  if (eventType === null || !isStageDefiningEventType(eventType)) return "applied";
  return EVENT_TYPE_TO_COLUMN[eventType];
}
