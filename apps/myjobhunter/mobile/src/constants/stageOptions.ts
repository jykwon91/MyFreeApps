import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import { KANBAN_COLUMN_ORDER } from "@myjobhunter/api-client/constants/kanbanColumnOrder";
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import type { SheetOption } from "@platform/mobile";

/** The board's columns, left to right, to move an application between. */
export const STAGE_OPTIONS: readonly SheetOption<KanbanColumn>[] = KANBAN_COLUMN_ORDER.map((column) => ({
  value: column,
  label: KANBAN_COLUMN_LABELS[column],
}));
