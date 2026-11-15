import { useRef, useState } from "react";
import { showSuccess, showError, extractErrorMessage } from "@platform/ui";
import {
  useGetApplicationQuery,
  useTransitionApplicationMutation,
} from "@myjobhunter/api-client/store/applicationsApi";
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
 * ref guard drops a second pick that lands before React re-renders.
 * ``selectedColumn`` is the stage the user picked until the move has been
 * saved AND the application refetch it triggers has landed, so the select
 * never snaps back to the old stage. The move invalidates the application's
 * cache tag (the response is a single event, not the updated application),
 * and RTK Query starts that refetch synchronously when the move resolves, so
 * this hook's own query subscription already reports ``isFetching`` by the
 * render that follows. A failed move reverts straight away (no refetch).
 */
export function useStageMove(applicationId: string, currentColumn: KanbanColumn) {
  const [transitionApplication] = useTransitionApplicationMutation();
  const { isFetching } = useGetApplicationQuery(applicationId);
  const [pendingColumn, setPendingColumn] = useState<KanbanColumn | null>(null);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);

  // Once the saved move's refetch has landed, drop the pending stage (state
  // adjusted during render, not in an effect) so a later unrelated refetch
  // can't bring it back and lock the select.
  if (pendingColumn !== null && saved && !isFetching) {
    setPendingColumn(null);
    setSaved(false);
  }

  const isMoving = pendingColumn !== null && !(saved && !isFetching);

  async function moveTo(target: KanbanColumn) {
    if (inFlight.current || isMoving || target === currentColumn) return;
    inFlight.current = true;
    setSaved(false);
    setPendingColumn(target);
    try {
      await transitionApplication({
        applicationId,
        target_column: target,
        idempotency_key: newIdempotencyKey(),
      }).unwrap();
      showSuccess(`Moved to ${KANBAN_COLUMN_LABELS[target]}`);
      setSaved(true);
    } catch (err) {
      showError(`Couldn't move: ${extractErrorMessage(err)}`);
      setPendingColumn(null);
    } finally {
      inFlight.current = false;
    }
  }

  return {
    selectedColumn: isMoving ? pendingColumn : currentColumn,
    isMoving,
    moveTo,
  };
}
