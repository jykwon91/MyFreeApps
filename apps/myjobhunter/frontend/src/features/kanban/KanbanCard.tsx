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
import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@platform/ui";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";
import type { BadgeColor } from "@platform/ui/components/ui/Badge";
import type { StatusTone } from "@myjobhunter/api-client/types/status-tone";
import { companyLogoUrl } from "@myjobhunter/api-client/utils/companyLogoUrl";
import { daysInStage } from "@myjobhunter/api-client/utils/daysInStage";
import { formatDaysInStage } from "@myjobhunter/api-client/utils/formatDaysInStage";
import { formatVerdict } from "@myjobhunter/api-client/utils/formatVerdict";
import { stageAgeTone } from "@myjobhunter/api-client/utils/stageAgeTone";
import { STATUS_TONE_BADGE_COLORS } from "@/constants/statusToneBadgeColors";
import { colorForVerdict } from "./verdictBadge";

interface KanbanCardProps {
  item: KanbanItem;
  onSelect: (id: string) => void;
  draggable?: boolean;
}

interface CardBodyProps {
  item: KanbanItem;
  stageDays: number | null;
  staleTone: StatusTone | null;
  verdictLabel: string | null;
  verdictColor: BadgeColor;
}

function CardBody({
  item,
  stageDays,
  staleTone,
  verdictLabel,
  verdictColor,
}: CardBodyProps) {
  // Only an http or https logo is loaded; anything else gets the plain circle.
  const logoUrl = companyLogoUrl(item.company_logo_url);
  return (
    <div className="flex items-start gap-2">
      {logoUrl ? (
        <img
          src={logoUrl}
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
          {staleTone !== null && stageDays !== null ? (
            <Badge label={formatDaysInStage(stageDays)} color={STATUS_TONE_BADGE_COLORS[staleTone]} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StaticKanbanCard({ item, onSelect }: KanbanCardProps) {
  // Read the clock once per card: whole days don't need a re-render to stay right.
  const [now] = useState(Date.now);
  const stageDays = daysInStage(item.stage_entered_at, now);
  const staleTone = stageAgeTone(stageDays);
  const verdictLabel = formatVerdict(item.verdict);
  const verdictColor = colorForVerdict(item.verdict);

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
        stageDays={stageDays}
        staleTone={staleTone}
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

  // Read the clock once per card: whole days don't need a re-render to stay right.
  const [now] = useState(Date.now);
  const stageDays = daysInStage(item.stage_entered_at, now);
  const staleTone = stageAgeTone(stageDays);
  const verdictLabel = formatVerdict(item.verdict);
  const verdictColor = colorForVerdict(item.verdict);

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
        stageDays={stageDays}
        staleTone={staleTone}
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
