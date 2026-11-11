/**
 * Mobile fallback for the kanban board (<768px).
 *
 * Drag-drop on touch is intentionally disabled per the UX review — the
 * dnd-kit TouchSensor competes with vertical scroll on a phone. Instead
 * of a board, we render a grouped list: column heading + cards stacked
 * vertically. Tapping a card opens the same drawer as the desktop board, and
 * each card has a Move button for changing its stage without dragging.
 */
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import { KANBAN_COLUMN_ORDER } from "@myjobhunter/api-client/constants/kanbanColumnOrder";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";
import KanbanMobileCard from "./KanbanMobileCard";

interface KanbanMobileListProps {
  itemsByColumn: Record<KanbanColumn, KanbanItem[]>;
  onSelectCard: (id: string) => void;
  /** Ids of the cards with a move in flight. */
  movingIds: ReadonlySet<string>;
  onMove: (item: KanbanItem, from: KanbanColumn, target: KanbanColumn) => void;
  /** Said politely to a screen reader when a move ends. */
  announcement: string;
  /** The card whose Move button should take focus, or null. */
  focusId: string | null;
  onFocused: () => void;
}

export default function KanbanMobileList({
  itemsByColumn,
  onSelectCard,
  movingIds,
  onMove,
  announcement,
  focusId,
  onFocused,
}: KanbanMobileListProps) {
  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {KANBAN_COLUMN_ORDER.map((column) => {
        const items = itemsByColumn[column];
        return (
          <section key={column} className="space-y-2">
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-medium">{KANBAN_COLUMN_LABELS[column]}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {items.length}
              </span>
            </header>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground border rounded-md p-3 bg-muted/30">
                No applications in this stage.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <KanbanMobileCard
                      item={item}
                      column={column}
                      isMoving={movingIds.has(item.id)}
                      onSelect={onSelectCard}
                      onMove={onMove}
                      shouldFocus={focusId === item.id}
                      onFocused={onFocused}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
