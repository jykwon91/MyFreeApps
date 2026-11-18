import { writeOutcome } from "@platform/core/utils/writeOutcome";
import type { ApplicationEvent } from "../types/application-event";
import type { KanbanCacheDispatch } from "../types/kanban/kanban-cache-dispatch";
import type { MoveKanbanItemArgs } from "../types/kanban/move-kanban-item-args";
import { optimisticStage } from "../utils/optimisticStage";
import { applicationsApi } from "./applicationsApi";
import { refetchAfterLostMove } from "./refetchAfterLostMove";

/**
 * Moves a card on the board at once, then tells the server. If the server
 * refuses, the card goes back and the error is rethrown for the caller to show.
 * If the answer was lost, the server may have moved it, so the card isn't put
 * back on a guess: the board is read again and shows where it really is.
 * The web's drag and drop and the phone's Move sheet both dispatch this.
 */
export function moveKanbanItem({ applicationId, target, idempotencyKey, occurredAt }: MoveKanbanItemArgs) {
  return async (dispatch: KanbanCacheDispatch): Promise<ApplicationEvent> => {
    const patch = dispatch(
      applicationsApi.util.updateQueryData("listApplicationsKanban", undefined, (draft) => {
        // Change only this card, so undoing a refused move can't undo another card's move made meanwhile.
        const card = draft.items.find((item) => item.id === applicationId);
        if (card) Object.assign(card, optimisticStage(target, occurredAt));
      }),
    );
    try {
      return await dispatch(
        applicationsApi.endpoints.transitionApplication.initiate(
          { applicationId, target_column: target, idempotency_key: idempotencyKey },
          { track: false },
        ),
      ).unwrap();
    } catch (error) {
      if (writeOutcome(error) === "unknown") dispatch(refetchAfterLostMove(applicationId));
      else patch.undo();
      throw error;
    }
  };
}
