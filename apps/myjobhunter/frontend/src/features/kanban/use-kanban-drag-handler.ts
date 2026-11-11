/**
 * Drag-handler hook for the kanban board.
 *
 * Turns a drop into a move:
 * - Generates an idempotency_key per drop so a flaky network can't
 *   create phantom duplicates server-side.
 * - Dispatches the shared moveKanbanItem, which moves the card in the
 *   listApplicationsKanban cache at once and puts it back if the server
 *   refuses. An open drawer refetches through the transition's tags.
 * - Surfaces a toast with the error message when the move fails.
 */
import { useCallback } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { useDispatch } from "react-redux";
import { showError, extractErrorMessage } from "@platform/ui";
import { moveKanbanItem } from "@myjobhunter/api-client/store/moveKanbanItem";
import type { AppDispatch } from "@/lib/store";
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";

const COLUMN_ID_PREFIX = "column-";

/** Build the droppable id used by KanbanColumn for a given column. */
export function columnDroppableId(column: KanbanColumn): string {
  return `${COLUMN_ID_PREFIX}${column}`;
}

/** Reverse: parse a droppable id back into a KanbanColumn (null on miss). */
export function columnFromDroppableId(id: string | null | undefined): KanbanColumn | null {
  if (!id || !id.startsWith(COLUMN_ID_PREFIX)) return null;
  const tail = id.slice(COLUMN_ID_PREFIX.length);
  if (tail === "applied" || tail === "interviewing" || tail === "offer" || tail === "closed") {
    return tail;
  }
  return null;
}

interface UseKanbanDragHandlerArgs {
  /** Resolve the column a given application id is currently in. */
  currentColumnFor: (applicationId: string) => KanbanColumn | null;
}

interface UseKanbanDragHandlerReturn {
  onDragEnd: (event: DragEndEvent) => Promise<void>;
}

export function useKanbanDragHandler({
  currentColumnFor,
}: UseKanbanDragHandlerArgs): UseKanbanDragHandlerReturn {
  const dispatch = useDispatch<AppDispatch>();

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const applicationId = String(event.active.id);
      const targetColumn = columnFromDroppableId(
        event.over?.id !== undefined ? String(event.over.id) : null,
      );
      if (!targetColumn) return; // Dropped outside any column.

      const currentColumn = currentColumnFor(applicationId);
      if (currentColumn === targetColumn) return; // No-op move.

      const idempotencyKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const occurredAt = new Date().toISOString();

      try {
        await dispatch(
          moveKanbanItem({ applicationId, target: targetColumn, idempotencyKey, occurredAt }),
        );
      } catch (err) {
        showError(`Couldn't move card: ${extractErrorMessage(err)}`);
      }
    },
    [dispatch, currentColumnFor],
  );

  return { onDragEnd };
}
