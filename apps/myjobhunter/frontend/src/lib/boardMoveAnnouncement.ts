import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import type { BoardMoveOutcome } from "@myjobhunter/api-client/types/kanban/board-move-outcome";
import { writeOutcome } from "@platform/core/utils/writeOutcome";

/** What a screen reader hears when a move ends: where the card went, that it went back, or that it can't be sure. */
export function boardMoveAnnouncement(outcome: BoardMoveOutcome): string {
  const role = outcome.item.role_title;
  if (outcome.kind === "moved") return `Moved ${role} to ${KANBAN_COLUMN_LABELS[outcome.target]}.`;
  if (writeOutcome(outcome.error) === "unknown") return `Not sure ${role} moved to ${KANBAN_COLUMN_LABELS[outcome.target]}; the board was refreshed.`;
  return `Couldn't move ${role} to ${KANBAN_COLUMN_LABELS[outcome.target]}; it was moved back.`;
}
