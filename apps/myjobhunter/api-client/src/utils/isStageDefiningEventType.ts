import { EVENT_TYPE_TO_COLUMN } from "../constants/eventTypeColumns";
import type { StageDefiningEventType } from "../types/kanban/stage-defining-event-type";

/** True for an event type that moves an application to a kanban column. */
export function isStageDefiningEventType(value: string): value is StageDefiningEventType {
  return Object.prototype.hasOwnProperty.call(EVENT_TYPE_TO_COLUMN, value);
}
