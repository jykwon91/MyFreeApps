/**
 * Drag-handler hook for the kanban board.
 *
 * Turns a drop into a move through the shared board move (optimistic move,
 * put back if the server refuses, toast either way).
 */
import { useCallback } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { BoardMoveState } from "@myjobhunter/api-client/types/kanban/board-move-state";
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";
import { columnForEventType } from "@myjobhunter/api-client/utils/columnForEventType";
import { isKanbanColumn } from "@myjobhunter/api-client/utils/isKanbanColumn";

const COLUMN_ID_PREFIX = "column-";

/** Build the droppable id used by KanbanColumn for a given column. */
export function columnDroppableId(column: KanbanColumn): string {
  return `${COLUMN_ID_PREFIX}${column}`;
}

/** Reverse: parse a droppable id back into a KanbanColumn (null on miss). */
export function columnFromDroppableId(id: string | null | undefined): KanbanColumn | null {
  if (!id || !id.startsWith(COLUMN_ID_PREFIX)) return null;
  const tail = id.slice(COLUMN_ID_PREFIX.length);
  return isKanbanColumn(tail) ? tail : null;
}

interface UseKanbanDragHandlerArgs {
  /** The card behind a dragged id, or null when it is no longer on the board. */
  itemFor: (applicationId: string) => KanbanItem | null;
  /** The shared move: the card moves at once, and a toast says how it ended. */
  moveTo: BoardMoveState["moveTo"];
}

interface UseKanbanDragHandlerReturn {
  onDragEnd: (event: DragEndEvent) => Promise<void>;
}

export function useKanbanDragHandler({
  itemFor,
  moveTo,
}: UseKanbanDragHandlerArgs): UseKanbanDragHandlerReturn {
  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const targetColumn = columnFromDroppableId(
        event.over?.id !== undefined ? String(event.over.id) : null,
      );
      if (!targetColumn) return; // Dropped outside any column.

      const item = itemFor(String(event.active.id));
      if (!item) return;

      await moveTo(item, columnForEventType(item.latest_event_type), targetColumn);
    },
    [itemFor, moveTo],
  );

  return { onDragEnd };
}
