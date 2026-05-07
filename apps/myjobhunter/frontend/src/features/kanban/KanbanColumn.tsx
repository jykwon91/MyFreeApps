/**
 * One kanban column. Owns:
 * - Header (title + count)
 * - Per-column scroll container (overflow-y: auto)
 * - dnd-kit SortableContext for the cards inside
 *
 * The outer board has NO horizontal scroll — the four columns are a fixed
 * grid. Each column scrolls vertically independently.
 */
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import KanbanCard from "./KanbanCard";
import { columnDroppableId } from "./use-kanban-drag-handler";
import type { KanbanColumn as KanbanColumnId } from "@/types/kanban/kanban-column";
import { KANBAN_COLUMN_LABELS } from "@/types/kanban/kanban-column";
import type { KanbanItem } from "@/types/kanban/kanban-item";

interface KanbanColumnProps {
  column: KanbanColumnId;
  items: KanbanItem[];
  onSelectCard: (id: string) => void;
}

export default function KanbanColumn({
  column,
  items,
  onSelectCard,
}: KanbanColumnProps) {
  const droppableId = columnDroppableId(column);
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  return (
    <section
      aria-label={`${KANBAN_COLUMN_LABELS[column]} column`}
      data-kanban-column={column}
      className="flex flex-col rounded-lg border bg-muted/30 min-h-0"
    >
      <header className="flex items-center justify-between px-3 py-2 border-b sticky top-0 bg-muted/30 backdrop-blur z-10">
        <h2 className="text-sm font-medium">{KANBAN_COLUMN_LABELS[column]}</h2>
        <span className="text-xs text-muted-foreground tabular-nums" aria-label="card count">
          {items.length}
        </span>
      </header>

      <div
        ref={setNodeRef}
        className={`flex-1 min-h-0 overflow-y-auto p-2 space-y-2 transition-colors ${
          isOver ? "bg-primary/5" : ""
        }`}
        data-kanban-droppable={droppableId}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <KanbanCard key={item.id} item={item} onSelect={onSelectCard} />
          ))}
        </SortableContext>

        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 px-2 text-center">
            Drop a card here.
          </p>
        ) : null}
      </div>
    </section>
  );
}
