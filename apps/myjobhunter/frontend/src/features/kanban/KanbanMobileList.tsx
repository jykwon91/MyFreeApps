/**
 * Mobile fallback for the kanban board (<768px).
 *
 * Drag-drop on touch is intentionally disabled per the UX review — the
 * dnd-kit TouchSensor competes with vertical scroll on a phone. Instead
 * of a board, we render a grouped list: column heading + cards stacked
 * vertically. Tapping a card opens the same drawer as the desktop board.
 */
import { Badge } from "@platform/ui";
import type { KanbanColumn } from "@/types/kanban/kanban-column";
import { KANBAN_COLUMN_LABELS, KANBAN_COLUMN_ORDER } from "@/types/kanban/kanban-column";
import type { KanbanItem } from "@/types/kanban/kanban-item";

interface KanbanMobileListProps {
  itemsByColumn: Record<KanbanColumn, KanbanItem[]>;
  onSelectCard: (id: string) => void;
}

export default function KanbanMobileList({
  itemsByColumn,
  onSelectCard,
}: KanbanMobileListProps) {
  return (
    <div className="space-y-4">
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
                    <button
                      type="button"
                      onClick={() => onSelectCard(item.id)}
                      className="w-full text-left rounded-md border bg-card p-3 hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <p className="text-sm font-semibold truncate">{item.role_title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.company_name}
                      </p>
                      {item.verdict ? (
                        <div className="mt-1.5">
                          <Badge label={item.verdict} color="blue" />
                        </div>
                      ) : null}
                    </button>
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
