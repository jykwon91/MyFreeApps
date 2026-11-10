import type { ApplicationEvent } from "../types/application-event";
import type { KanbanColumn } from "../types/kanban/kanban-column";
import { columnForEventType } from "./columnForEventType";
import { isStageDefiningEventType } from "./isStageDefiningEventType";

/**
 * The column an application sits in: that of its newest stage-defining event.
 * The detail endpoint returns events newest first, so the first match wins.
 */
export function currentKanbanColumn(events: readonly Pick<ApplicationEvent, "event_type">[]): KanbanColumn {
  const stageEvent = events.find((event) => isStageDefiningEventType(event.event_type));
  return columnForEventType(stageEvent?.event_type ?? null);
}
