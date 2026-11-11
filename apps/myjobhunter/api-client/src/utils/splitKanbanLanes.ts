import type { KanbanItem } from "../types/kanban/kanban-item";
import type { KanbanLane } from "../types/kanban/kanban-lane";
import { kanbanLaneFor } from "./kanbanLaneFor";

/** A column's cards by swim lane, each keeping the order it came in. */
export function splitKanbanLanes(items: readonly KanbanItem[]): Record<KanbanLane, KanbanItem[]> {
  const lanes: Record<KanbanLane, KanbanItem[]> = { strong_fit: [], everything_else: [] };
  for (const item of items) lanes[kanbanLaneFor(item.verdict)].push(item);
  return lanes;
}
