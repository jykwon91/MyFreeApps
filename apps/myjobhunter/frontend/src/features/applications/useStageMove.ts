import { useRef, useState } from "react";
import { showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { useTransitionApplicationMutation } from "@myjobhunter/api-client/store/applicationsApi";
import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Moves an application to another stage from a stage select.
 *
 * Only one move runs at a time: ``isMoving`` disables the select, and the
 * ref guard drops a second pick that lands before React re-renders. While
 * the request is in flight ``selectedColumn`` is the stage the user picked,
 * so the select doesn't snap back to the old stage until the move settles.
 */
export function useStageMove(applicationId: string, currentColumn: KanbanColumn) {
  const [transitionApplication] = useTransitionApplicationMutation();
  const [pendingColumn, setPendingColumn] = useState<KanbanColumn | null>(null);
  const inFlight = useRef(false);

  async function moveTo(target: KanbanColumn) {
    if (inFlight.current || target === currentColumn) return;
    inFlight.current = true;
    setPendingColumn(target);
    try {
      await transitionApplication({
        applicationId,
        target_column: target,
        idempotency_key: newIdempotencyKey(),
      }).unwrap();
      showSuccess(`Moved to ${KANBAN_COLUMN_LABELS[target]}`);
    } catch (err) {
      showError(`Couldn't move: ${extractErrorMessage(err)}`);
    } finally {
      inFlight.current = false;
      setPendingColumn(null);
    }
  }

  return {
    selectedColumn: pendingColumn ?? currentColumn,
    isMoving: pendingColumn !== null,
    moveTo,
  };
}
