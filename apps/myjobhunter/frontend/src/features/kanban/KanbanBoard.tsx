/**
 * Top-level kanban board for the dashboard.
 *
 * Renders four columns (applied / interviewing / offer / closed) on
 * desktop with dnd-kit drag-drop. On viewports < 768px the board is
 * replaced by a grouped list — drag-drop on touch fights with vertical
 * scroll on mobile and the UX review explicitly requested no TouchSensor.
 *
 * The closed column is hidden by default behind an accordion.
 *
 * Per UX review:
 * - 4-column fixed grid; no horizontal scroll on the outer container.
 * - Each column scrolls vertically independently.
 * - Drag activation requires a 5px move so cards remain clickable.
 * - DragOverlay portal so the drag clone isn't clipped by column overflow.
 */
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMediaQuery } from "@platform/ui";
import KanbanColumn from "./KanbanColumn";
import KanbanCard from "./KanbanCard";
import ClosedColumnAccordion from "./ClosedColumnAccordion";
import KanbanMobileList from "./KanbanMobileList";
import KanbanEmptyState from "./KanbanEmptyState";
import { useKanbanDragHandler } from "./use-kanban-drag-handler";
import { columnForEventType } from "./kanban-stage-mapping";
import type { KanbanColumn as KanbanColumnId } from "@/types/kanban/kanban-column";
import type { KanbanItem } from "@/types/kanban/kanban-item";

interface KanbanBoardProps {
  items: KanbanItem[];
  onSelectCard: (id: string) => void;
}

const ACTIVE_COLUMNS: readonly KanbanColumnId[] = ["applied", "interviewing", "offer"];

export default function KanbanBoard({ items, onSelectCard }: KanbanBoardProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");

  const [activeId, setActiveId] = useState<string | null>(null);

  const itemsByColumn = useMemo<Record<KanbanColumnId, KanbanItem[]>>(() => {
    const grouped: Record<KanbanColumnId, KanbanItem[]> = {
      applied: [],
      interviewing: [],
      offer: [],
      closed: [],
    };
    for (const item of items) {
      const col = columnForEventType(item.latest_event_type);
      grouped[col].push(item);
    }
    return grouped;
  }, [items]);

  const itemById = useMemo(() => {
    const map = new Map<string, KanbanItem>();
    for (const i of items) map.set(i.id, i);
    return map;
  }, [items]);

  const currentColumnFor = useMemo(() => {
    return (applicationId: string): KanbanColumnId | null => {
      const item = itemById.get(applicationId);
      if (!item) return null;
      return columnForEventType(item.latest_event_type);
    };
  }, [itemById]);

  const { onDragEnd } = useKanbanDragHandler({ currentColumnFor });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
    // No TouchSensor — drag-drop on touch competes with vertical scroll.
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  if (items.length === 0) {
    return <KanbanEmptyState />;
  }

  if (isMobile) {
    return (
      <main className="p-4 space-y-6">
        <KanbanMobileList
          itemsByColumn={itemsByColumn}
          onSelectCard={onSelectCard}
        />
      </main>
    );
  }

  const activeItem = activeId ? itemById.get(activeId) ?? null : null;

  return (
    <main className="p-4 sm:p-8 flex flex-col h-[calc(100vh-4rem)] min-h-0">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          {items.length} active {items.length === 1 ? "application" : "applications"}
        </p>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={async (event) => {
          setActiveId(null);
          await onDragEnd(event);
        }}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
          {ACTIVE_COLUMNS.map((column) => (
            <KanbanColumn
              key={column}
              column={column}
              items={itemsByColumn[column]}
              onSelectCard={onSelectCard}
            />
          ))}
        </div>

        <div className="mt-4">
          <ClosedColumnAccordion
            items={itemsByColumn.closed}
            onSelectCard={onSelectCard}
          />
        </div>

        <DragOverlay>
          {activeItem ? (
            <div className="cursor-grabbing rotate-1">
              <KanbanCard item={activeItem} onSelect={() => {}} draggable={false} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </main>
  );
}
