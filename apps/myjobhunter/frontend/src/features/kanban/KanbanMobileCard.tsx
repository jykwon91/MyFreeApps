/**
 * One application in the phone-width list: tap it to open the drawer, or use
 * Move to send it to another stage. Shows the same verdict and days-in-stage
 * badges as a board card.
 */
import { useState } from "react";
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";
import KanbanCardBadges from "./KanbanCardBadges";
import KanbanMoveMenu from "./KanbanMoveMenu";

interface KanbanMobileCardProps {
  item: KanbanItem;
  column: KanbanColumn;
  isMoving: boolean;
  onSelect: (id: string) => void;
  onMove: (item: KanbanItem, from: KanbanColumn, target: KanbanColumn) => void;
  /** True when this card's Move button should take focus (right after a move ends). */
  shouldFocus: boolean;
  onFocused: () => void;
}

export default function KanbanMobileCard({ item, column, isMoving, onSelect, onMove, shouldFocus, onFocused }: KanbanMobileCardProps) {
  // Read the clock once per card: whole days don't need a re-render to stay right.
  const [now] = useState(Date.now);

  return (
    <div
      data-kanban-card-id={item.id}
      className="flex items-center gap-2 rounded-md border bg-card pr-2 hover:border-primary/30"
    >
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        className="min-h-[44px] min-w-0 flex-1 rounded-md p-3 text-left focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <p className="text-sm font-semibold truncate">{item.role_title}</p>
        <p className="text-xs text-muted-foreground truncate">{item.company_name}</p>
        <KanbanCardBadges item={item} now={now} />
      </button>
      <KanbanMoveMenu
        item={item}
        column={column}
        isMoving={isMoving}
        onMove={(target) => onMove(item, column, target)}
        shouldFocus={shouldFocus}
        onFocused={onFocused}
      />
    </div>
  );
}
