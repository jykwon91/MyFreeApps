import type { ApplicationEvent } from "../types/application-event";
import type { KanbanCacheDispatch } from "../types/kanban/kanban-cache-dispatch";
import type { MoveKanbanItemArgs } from "../types/kanban/move-kanban-item-args";
import { optimisticStage } from "../utils/optimisticStage";
import { applicationsApi } from "./applicationsApi";

/**
 * Moves a card on the board at once, then tells the server. If the server
 * refuses, the card goes back and the error is rethrown for the caller to show.
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
      patch.undo();
      throw error;
    }
  };
}
