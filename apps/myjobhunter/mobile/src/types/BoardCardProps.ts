import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";

export interface BoardCardProps {
  item: KanbanItem;
  /** When the board loaded, for how long each card has sat in its stage. */
  now: number;
  isMoving: boolean;
  onOpen: () => void;
  onMove: () => void;
}
