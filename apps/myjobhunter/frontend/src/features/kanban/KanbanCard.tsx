/**
 * Compact card rendered inside a KanbanColumn.
 *
 * - Role title (semibold, 1 line, truncate)
 * - Company name (muted, 1 line, truncate) with optional logo
 * - Verdict badge (when an analysis spawned the application)
 * - "Days in stage" chip — only when ``>= 7d``, amber at 14+, red at 21+
 *
 * The card itself is the dnd-kit draggable. ``cursor: grab`` while idle,
 * ``cursor: grabbing`` while drag is in flight. Click navigates the drawer
 * via the parent's ``onSelect`` prop.
 *
 * The ``draggable`` prop is true for normal in-column cards, false for
 * the floating clone rendered inside ``<DragOverlay>``.
 */
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@platform/ui";
import type { KanbanItem } from "@/types/kanban/kanban-item";

interface KanbanCardProps {
  item: KanbanItem;
  onSelect: (id: string) => void;
  draggable?: boolean;
}

const STALE_AMBER_DAYS = 14;
const STALE_RED_DAYS = 21;
const STALE_VISIBLE_THRESHOLD = 7;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function staleBadgeColor(days: number): "gray" | "yellow" | "red" {
  if (days >= STALE_RED_DAYS) return "red";
  if (days >= STALE_AMBER_DAYS) return "yellow";
  return "gray";
}

const VERDICT_LABELS: Record<string, string> = {
  strong_fit: "Strong fit",
  worth_considering: "Worth considering",
  stretch: "Stretch",
  mismatch: "Mismatch",
};

const VERDICT_COLORS: Record<string, "green" | "blue" | "yellow" | "red"> = {
  strong_fit: "green",
  worth_considering: "blue",
  stretch: "yellow",
  mismatch: "red",
};

interface CardBodyProps {
  item: KanbanItem;
  showStaleChip: boolean;
  stageDays: number | null;
  verdictLabel: string | null;
  verdictColor: "green" | "blue" | "yellow" | "red";
}

function CardBody({
  item,
  showStaleChip,
  stageDays,
  verdictLabel,
  verdictColor,
}: CardBodyProps) {
  return (
    <div className="flex items-start gap-2">
      {item.company_logo_url ? (
        <img
          src={item.company_logo_url}
          alt=""
          className="w-6 h-6 rounded-full object-cover flex-shrink-0 bg-muted"
          loading="lazy"
        />
      ) : (
        <div
          className="w-6 h-6 rounded-full bg-muted flex-shrink-0"
          aria-hidden="true"
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{item.role_title}</p>
        <p className="text-xs text-muted-foreground truncate">{item.company_name}</p>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {verdictLabel ? <Badge label={verdictLabel} color={verdictColor} /> : null}
          {showStaleChip && stageDays !== null ? (
            <Badge label={`${stageDays}d in stage`} color={staleBadgeColor(stageDays)} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StaticKanbanCard({ item, onSelect }: KanbanCardProps) {
  const stageDays = daysSince(item.stage_entered_at);
  const showStaleChip = stageDays !== null && stageDays >= STALE_VISIBLE_THRESHOLD;
  const verdictLabel = item.verdict ? VERDICT_LABELS[item.verdict] ?? item.verdict : null;
  const verdictColor = item.verdict ? VERDICT_COLORS[item.verdict] ?? "blue" : "blue";

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(item.id);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item.id)}
      onKeyDown={handleKeyDown}
      data-kanban-card-id={item.id}
      className="rounded-md border bg-card p-3 shadow-md"
    >
      <CardBody
        item={item}
        showStaleChip={showStaleChip}
        stageDays={stageDays}
        verdictLabel={verdictLabel}
        verdictColor={verdictColor}
      />
    </div>
  );
}

function SortableKanbanCard({ item, onSelect }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Hide the original card while the DragOverlay renders the floating clone.
    opacity: isDragging ? 0 : 1,
  };

  const stageDays = daysSince(item.stage_entered_at);
  const showStaleChip = stageDays !== null && stageDays >= STALE_VISIBLE_THRESHOLD;
  const verdictLabel = item.verdict ? VERDICT_LABELS[item.verdict] ?? item.verdict : null;
  const verdictColor = item.verdict ? VERDICT_COLORS[item.verdict] ?? "blue" : "blue";

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    // dnd-kit's PointerSensor swallows clicks that began as drags via the
    // 5px activation constraint, so this only fires on a true click.
    e.stopPropagation();
    onSelect(item.id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(item.id);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-kanban-card-id={item.id}
      className="cursor-grab active:cursor-grabbing rounded-md border bg-card p-3 shadow-sm hover:shadow-md hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
    >
      <CardBody
        item={item}
        showStaleChip={showStaleChip}
        stageDays={stageDays}
        verdictLabel={verdictLabel}
        verdictColor={verdictColor}
      />
    </div>
  );
}

export default function KanbanCard({ item, onSelect, draggable = true }: KanbanCardProps) {
  if (!draggable) {
    return <StaticKanbanCard item={item} onSelect={onSelect} />;
  }
  return <SortableKanbanCard item={item} onSelect={onSelect} />;
}
