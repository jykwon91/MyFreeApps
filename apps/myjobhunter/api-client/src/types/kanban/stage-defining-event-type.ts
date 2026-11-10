import type { STAGE_DEFINING_EVENT_TYPES } from "../../constants/stageDefiningEventTypes";

/** An event type that moves an application to a kanban column. */
export type StageDefiningEventType = (typeof STAGE_DEFINING_EVENT_TYPES)[number];
