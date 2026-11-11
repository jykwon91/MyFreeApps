import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import type { BoardMoveOutcome } from "@myjobhunter/api-client/types/kanban/board-move-outcome";

/** What a screen reader hears when a move ends: where the card went, or that it went back. */
export function boardMoveAnnouncement(outcome: BoardMoveOutcome): string {
  const role = outcome.item.role_title;
  return outcome.kind === "moved"
    ? `Moved ${role} to ${KANBAN_COLUMN_LABELS[outcome.target]}.`
    : `Couldn't move ${role} to ${KANBAN_COLUMN_LABELS[outcome.target]}; it was moved back.`;
}
