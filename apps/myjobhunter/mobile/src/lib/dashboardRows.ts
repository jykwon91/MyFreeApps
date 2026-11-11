import { KANBAN_COLUMN_ORDER } from "@myjobhunter/api-client/constants/kanbanColumnOrder";
import { KANBAN_LANE_ORDER } from "@myjobhunter/api-client/constants/kanbanLaneOrder";
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";
import { splitKanbanLanes } from "@myjobhunter/api-client/utils/splitKanbanLanes";
import type { DashboardLayout } from "../types/DashboardLayout";
import type { DashboardRow } from "../types/DashboardRow";

/** The stage the website folds away until it's opened. */
const COLLAPSIBLE_STAGE: KanbanColumn = "closed";

function stageRows(column: KanbanColumn, items: readonly KanbanItem[], layout: DashboardLayout): DashboardRow[] {
  const isCollapsible = column === COLLAPSIBLE_STAGE;
  const isOpen = !isCollapsible || layout.isClosedOpen;
  const rows: DashboardRow[] = [{ kind: "stage", key: `stage-${column}`, column, count: items.length, isCollapsible, isOpen }];
  if (!isOpen) return rows;
  const lanes = splitKanbanLanes(items);
  for (const lane of KANBAN_LANE_ORDER) {
    const isCollapsed = layout.collapsedLanes.has(lane);
    rows.push({ kind: "lane", key: `lane-${column}-${lane}`, lane, count: lanes[lane].length, isCollapsed });
    if (isCollapsed) continue;
    // Both lanes show in every open stage, even an empty one, as on the website.
    if (lanes[lane].length === 0) rows.push({ kind: "laneEmpty", key: `none-${column}-${lane}` });
    for (const item of lanes[lane]) rows.push({ kind: "card", key: item.id, item, column });
  }
  return rows;
}

/** The board as one list: each stage in order, its lanes, then its cards. */
export function dashboardRows(itemsByColumn: Record<KanbanColumn, KanbanItem[]>, layout: DashboardLayout): DashboardRow[] {
  return KANBAN_COLUMN_ORDER.flatMap((column) => stageRows(column, itemsByColumn[column], layout));
}

/** Where a stage's heading is in the list, for jumping to it. */
export function stageRowIndex(rows: readonly DashboardRow[], column: KanbanColumn): number {
  return rows.findIndex((row) => row.kind === "stage" && row.column === column);
}
