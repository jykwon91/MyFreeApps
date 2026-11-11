import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import { moveKanbanItem } from "@myjobhunter/api-client/store/moveKanbanItem";
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";
import { useToast } from "@platform/mobile";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { APPLICATION_DETAIL_MESSAGES } from "../../constants/applicationDetail";
import type { AppDispatch } from "../../lib/store";
import { writeFailure } from "../../lib/writeFailure";

/**
 * Moves cards between stages the way the website's drag and drop does: the card
 * moves at once, then a toast says the server agreed, or it goes back.
 */
export function useBoardMoves() {
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();
  const [movingIds, setMovingIds] = useState<ReadonlySet<string>>(new Set());

  function setMoving(id: string, isMoving: boolean): void {
    setMovingIds((current) => {
      const next = new Set(current);
      if (isMoving) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function moveTo(item: KanbanItem, from: KanbanColumn, target: KanbanColumn): Promise<void> {
    if (target === from || movingIds.has(item.id)) return;
    setMoving(item.id, true);
    try {
      // A fresh key per move, as the website's board sends, so a retried request can't move it twice.
      await dispatch(
        moveKanbanItem({ applicationId: item.id, target, idempotencyKey: randomUUID(), occurredAt: new Date().toISOString() }),
      );
      showToast(`${APPLICATION_DETAIL_MESSAGES.movedTo} ${KANBAN_COLUMN_LABELS[target]}.`);
    } catch (error) {
      showToast(writeFailure(error, APPLICATION_DETAIL_MESSAGES.couldntMove), "error");
    } finally {
      setMoving(item.id, false);
    }
  }

  return { movingIds, moveTo };
}
