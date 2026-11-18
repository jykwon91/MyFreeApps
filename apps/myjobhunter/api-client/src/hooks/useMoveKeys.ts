import { useRef } from "react";
import type { KanbanColumn } from "../types/kanban/kanban-column";
import type { MoveKeys } from "../types/kanban/move-keys";
import type { PendingMoveKey } from "../types/kanban/pending-move-key";

/**
 * Idempotency keys for stage moves. A retry of the same move (same application, same target stage) gets the same key
 * back, so the server counts it once even if the first attempt went through and only its answer was lost. A different
 * move gets a fresh key. `settle` forgets the key once the move is decided: it went through, or the server refused it.
 */
export function useMoveKeys(newKey: () => string): MoveKeys {
  const pending = useRef<Map<string, PendingMoveKey>>(new Map());

  function keyFor(applicationId: string, target: KanbanColumn): string {
    const existing = pending.current.get(applicationId);
    if (existing && existing.target === target) return existing.key;
    const key = newKey();
    pending.current.set(applicationId, { target, key });
    return key;
  }

  function settle(applicationId: string): void {
    pending.current.delete(applicationId);
  }

  return { keyFor, settle };
}
