import { COLUMN_TO_DEFAULT_EVENT_TYPE } from "../constants/columnDefaultEventTypes";
import type { KanbanColumn } from "../types/kanban/kanban-column";
import type { KanbanStageFields } from "../types/kanban/kanban-stage-fields";

/**
 * A moved card's stage before the server confirms: the target column's
 * default event type, entered now.
 */
export function optimisticStage(targetColumn: KanbanColumn, occurredAt: string): KanbanStageFields {
  return { latest_event_type: COLUMN_TO_DEFAULT_EVENT_TYPE[targetColumn], stage_entered_at: occurredAt };
}
