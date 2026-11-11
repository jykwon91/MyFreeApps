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
import { useCallback, useMemo, useState } from "react";
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
import { useBoardMoveFeedback } from "./use-board-move-feedback";
import DashboardStaleBanner from "@/features/dashboard/DashboardStaleBanner";
import { useBoardMove } from "@myjobhunter/api-client/hooks/useBoardMove";
import { newIdempotencyKey } from "@/lib/newIdempotencyKey";
import { groupKanbanItems } from "@myjobhunter/api-client/utils/groupKanbanItems";
import { KANBAN_ACTIVE_COLUMNS } from "@myjobhunter/api-client/constants/kanbanActiveColumns";
import { activeApplicationCount } from "@/lib/activeApplicationCount";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";

interface KanbanBoardProps {
  items: KanbanItem[];
  onSelectCard: (id: string) => void;
  /** True when a refresh failed and these are the cards from the last good load. */
  isStale?: boolean;
}

export default function KanbanBoard({ items, onSelectCard, isStale = false }: KanbanBoardProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");

  const [activeId, setActiveId] = useState<string | null>(null);

  const itemsByColumn = useMemo(() => groupKanbanItems(items), [items]);

  const itemById = useMemo(() => {
    const map = new Map<string, KanbanItem>();
    for (const i of items) map.set(i.id, i);
    return map;
  }, [items]);

  const itemFor = useCallback((applicationId: string) => itemById.get(applicationId) ?? null, [itemById]);

  const { notify, announcement, focusId, clearFocus } = useBoardMoveFeedback();
  const { movingIds, moveTo } = useBoardMove({ newKey: newIdempotencyKey, notify });
  const { onDragEnd } = useKanbanDragHandler({ itemFor, moveTo });
  const activeCount = activeApplicationCount(itemsByColumn);

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
        {isStale ? <DashboardStaleBanner /> : null}
        <KanbanMobileList
          itemsByColumn={itemsByColumn}
          onSelectCard={onSelectCard}
          movingIds={movingIds}
          onMove={moveTo}
          announcement={announcement}
          focusId={focusId}
          onFocused={clearFocus}
        />
      </main>
    );
  }

  const activeItem = activeId ? itemById.get(activeId) ?? null : null;

  return (
    <main className="p-4 sm:p-8 flex flex-col h-[calc(100vh-4rem)] min-h-0">
      {isStale ? <DashboardStaleBanner /> : null}
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          {activeCount} active {activeCount === 1 ? "application" : "applications"}
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
          {KANBAN_ACTIVE_COLUMNS.map((column) => (
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
