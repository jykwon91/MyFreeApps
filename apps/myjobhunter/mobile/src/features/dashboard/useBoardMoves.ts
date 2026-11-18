import { useBoardMove } from "@myjobhunter/api-client/hooks/useBoardMove";
import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import type { BoardMoveState } from "@myjobhunter/api-client/types/kanban/board-move-state";
import { useToast } from "@platform/mobile";
import { randomUUID } from "expo-crypto";
import { APPLICATION_DETAIL_MESSAGES } from "../../constants/applicationDetail";
import { moveFailure } from "../../lib/writeFailure";

/**
 * Moves cards between stages the way the website's drag and drop does: the card
 * moves at once, then a toast says the server agreed, or it goes back.
 */
export function useBoardMoves(): BoardMoveState {
  const { showToast } = useToast();
  return useBoardMove({
    // A new key per move; the board reuses it when the same move is retried after a lost answer.
    newKey: randomUUID,
    notify: (outcome) => {
      if (outcome.kind === "moved") {
        showToast(`${APPLICATION_DETAIL_MESSAGES.movedTo} ${KANBAN_COLUMN_LABELS[outcome.target]}.`);
        return;
      }
      const message = moveFailure(outcome.error);
      if (message) showToast(message, "error");
    },
  });
}
