import { KANBAN_LANE_ORDER } from "@myjobhunter/api-client/constants/kanbanLaneOrder";
import type { KanbanLane } from "@myjobhunter/api-client/types/kanban/kanban-lane";
import type { DashboardLayout } from "../types/DashboardLayout";

function isKanbanLane(value: unknown): value is KanbanLane {
  return KANBAN_LANE_ORDER.some((lane) => lane === value);
}

/** The folds the phone kept, or null if what it kept isn't them, such as from an older version. */
export function parseDashboardFolds(raw: string): DashboardLayout | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { collapsedLanes, isClosedOpen } = value as Record<string, unknown>;
    if (!Array.isArray(collapsedLanes) || typeof isClosedOpen !== "boolean") return null;
    return { collapsedLanes: new Set(collapsedLanes.filter(isKanbanLane)), isClosedOpen };
  } catch {
    return null;
  }
}
