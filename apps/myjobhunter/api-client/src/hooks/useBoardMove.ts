import { useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { moveKanbanItem } from "../store/moveKanbanItem";
import type { BoardMoveOptions } from "../types/kanban/board-move-options";
import type { BoardMoveState } from "../types/kanban/board-move-state";
import type { KanbanCacheDispatch } from "../types/kanban/kanban-cache-dispatch";
import type { KanbanColumn } from "../types/kanban/kanban-column";
import type { KanbanItem } from "../types/kanban/kanban-item";

/**
 * Moves cards between stages for the web's board and the phone's list: the card
 * moves at once, then `notify` hears whether the server agreed or the card went
 * back. Skips a move to the stage the card is already in, and one for a card
 * whose move is still in flight.
 */
export function useBoardMove({ newKey, notify }: BoardMoveOptions): BoardMoveState {
  const dispatch = useDispatch<KanbanCacheDispatch>();
  const [movingIds, setMovingIds] = useState<ReadonlySet<string>>(new Set());
  // The guard reads a ref so two quick moves can't both see "not moving" in one render.
  const inFlight = useRef<Set<string>>(new Set());

  function setMoving(id: string, isMoving: boolean): void {
    if (isMoving) inFlight.current.add(id);
    else inFlight.current.delete(id);
    setMovingIds(new Set(inFlight.current));
  }

  async function moveTo(item: KanbanItem, from: KanbanColumn, target: KanbanColumn): Promise<void> {
    if (target === from || inFlight.current.has(item.id)) return;
    setMoving(item.id, true);
    try {
      await dispatch(
        moveKanbanItem({ applicationId: item.id, target, idempotencyKey: newKey(), occurredAt: new Date().toISOString() }),
      );
      notify({ kind: "moved", item, target });
    } catch (error) {
      notify({ kind: "failed", item, target, error });
    } finally {
      setMoving(item.id, false);
    }
  }

  return { movingIds, moveTo };
}
