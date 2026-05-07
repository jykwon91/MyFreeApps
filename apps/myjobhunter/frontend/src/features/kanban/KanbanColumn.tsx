/**
 * One kanban column. Owns:
 * - Header (title + count)
 * - Per-column scroll container (overflow-y: auto)
 * - dnd-kit SortableContext for the cards inside
 * - Internal swim lanes: cards grouped by verdict (Strong fit / Else)
 *   with collapsible lane headers, persisted to localStorage
 *
 * The outer board has NO horizontal scroll — the four columns are a fixed
 * grid. Each column scrolls vertically independently.
 *
 * Swim lanes are vertical sections within each column. Drag-drop targets
 * the column (not the lane); the card's lane is determined by its
 * ``verdict``, not by where it's dropped. Operator can collapse a lane
 * to hide its cards across all columns — collapse state is global per
 * lane via ``mjh_kanban_lane_<lane>`` localStorage key.
 */
import { ChevronDown, ChevronRight } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import KanbanCard from "./KanbanCard";
import { columnDroppableId } from "./use-kanban-drag-handler";
import { useLaneCollapse, type KanbanLane } from "./use-lane-collapse";
import type { KanbanColumn as KanbanColumnId } from "@/types/kanban/kanban-column";
import { KANBAN_COLUMN_LABELS } from "@/types/kanban/kanban-column";
import type { KanbanItem } from "@/types/kanban/kanban-item";

interface KanbanColumnProps {
  column: KanbanColumnId;
  items: KanbanItem[];
  onSelectCard: (id: string) => void;
}

const LANE_LABELS: Record<KanbanLane, string> = {
  strong_fit: "Strong fit",
  everything_else: "Everything else",
};

function laneFor(verdict: string | null): KanbanLane {
  return verdict === "strong_fit" ? "strong_fit" : "everything_else";
}

export default function KanbanColumn({
  column,
  items,
  onSelectCard,
}: KanbanColumnProps) {
  const droppableId = columnDroppableId(column);
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  const strongFit = items.filter((i) => laneFor(i.verdict) === "strong_fit");
  const everythingElse = items.filter(
    (i) => laneFor(i.verdict) === "everything_else",
  );

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
        className={`flex-1 min-h-0 overflow-y-auto p-2 transition-colors ${
          isOver ? "bg-primary/5" : ""
        }`}
        data-kanban-droppable={droppableId}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <Lane lane="strong_fit" items={strongFit} onSelectCard={onSelectCard} />
          <Lane
            lane="everything_else"
            items={everythingElse}
            onSelectCard={onSelectCard}
          />
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

interface LaneProps {
  lane: KanbanLane;
  items: KanbanItem[];
  onSelectCard: (id: string) => void;
}

function Lane({ lane, items, onSelectCard }: LaneProps) {
  const { collapsed, toggle } = useLaneCollapse(lane);
  const isStrong = lane === "strong_fit";

  // Render the lane header even when empty in this column — operator
  // needs to see both lanes exist (UX review: "lane with 0 cards: show
  // header with count of 0 + 'None' placeholder. Don't hide.")
  return (
    <div className="mb-2 last:mb-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={`${LANE_LABELS[lane]} lane`}
        className="w-full flex items-center gap-1.5 px-1 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      >
        {collapsed ? (
          <ChevronRight size={12} aria-hidden="true" />
        ) : (
          <ChevronDown size={12} aria-hidden="true" />
        )}
        <span className={isStrong ? "text-emerald-700 dark:text-emerald-400" : ""}>
          {LANE_LABELS[lane]}
        </span>
        <span className="ml-auto tabular-nums">{items.length}</span>
      </button>
      {collapsed ? null : (
        <div className="space-y-2 pt-1">
          {items.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/70 px-2 py-1">None</p>
          ) : (
            items.map((item) => (
              <KanbanCard key={item.id} item={item} onSelect={onSelectCard} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
