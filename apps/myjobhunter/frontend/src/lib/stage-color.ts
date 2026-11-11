import type { BadgeColor } from "@platform/ui/components/ui/Badge";
import { KANBAN_COLUMN_TONES } from "@myjobhunter/api-client/constants/kanbanColumnTones";
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import { STATUS_TONE_BADGE_COLORS } from "@/constants/statusToneBadgeColors";

/** The badge color for an application's stage. */
export function getStageColor(column: KanbanColumn): BadgeColor {
  return STATUS_TONE_BADGE_COLORS[KANBAN_COLUMN_TONES[column]];
}
