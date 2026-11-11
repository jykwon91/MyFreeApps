import { useBoardMove } from "@myjobhunter/api-client/hooks/useBoardMove";
import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import type { BoardMoveState } from "@myjobhunter/api-client/types/kanban/board-move-state";
import { useToast } from "@platform/mobile";
import { randomUUID } from "expo-crypto";
import { APPLICATION_DETAIL_MESSAGES } from "../../constants/applicationDetail";
import { writeFailure } from "../../lib/writeFailure";

/**
 * Moves cards between stages the way the website's drag and drop does: the card
 * moves at once, then a toast says the server agreed, or it goes back.
 */
export function useBoardMoves(): BoardMoveState {
  const { showToast } = useToast();
  return useBoardMove({
    // A fresh key per move, as the website's board sends, so a retried request can't move it twice.
    newKey: randomUUID,
    notify: (outcome) => {
      if (outcome.kind === "moved") showToast(`${APPLICATION_DETAIL_MESSAGES.movedTo} ${KANBAN_COLUMN_LABELS[outcome.target]}.`);
      else showToast(writeFailure(outcome.error, APPLICATION_DETAIL_MESSAGES.couldntMove), "error");
    },
  });
}
