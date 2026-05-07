/**
 * The "Closed" column collapsed behind an accordion.
 *
 * Hiding closed applications by default keeps the active funnel uncluttered
 * — most operators care about applied / interviewing / offer most of the
 * time. The accordion expands inline; collapse state lives in component
 * state and is intentionally NOT persisted to localStorage (closed
 * applications expand-by-default-when-needed feels right; persisting hides
 * cards across sessions).
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import KanbanColumn from "./KanbanColumn";
import type { KanbanItem } from "@/types/kanban/kanban-item";

interface ClosedColumnAccordionProps {
  items: KanbanItem[];
  onSelectCard: (id: string) => void;
}

export default function ClosedColumnAccordion({
  items,
  onSelectCard,
}: ClosedColumnAccordionProps) {
  const [open, setOpen] = useState(false);
  const Icon = open ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-lg border bg-muted/30 flex flex-col min-h-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between px-3 py-2 border-b hover:bg-muted/50 text-left"
        aria-expanded={open}
        aria-controls="kanban-closed-column-body"
      >
        <span className="flex items-center gap-1.5">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Closed</span>
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
      </button>
      {open ? (
        <div id="kanban-closed-column-body" className="flex-1 min-h-0">
          <KanbanColumn
            column="closed"
            items={items}
            onSelectCard={onSelectCard}
          />
        </div>
      ) : null}
    </div>
  );
}
