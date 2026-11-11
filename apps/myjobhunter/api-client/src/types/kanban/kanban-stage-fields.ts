import type { KanbanItem } from "./kanban-item";

/** The fields of a card that say which stage it's in and since when. */
export type KanbanStageFields = Pick<KanbanItem, "latest_event_type" | "stage_entered_at">;
