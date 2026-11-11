import type { KanbanLane } from "@myjobhunter/api-client/types/kanban/kanban-lane";
import { useEffect, useState } from "react";
import { readDashboardFolds, writeDashboardFolds } from "../../lib/dashboardFoldPrefs";
import type { DashboardLayout } from "../../types/DashboardLayout";

/**
 * Which lanes and stages are folded, kept between launches as the website keeps them.
 * `layout` is null until the phone has read them, so the board never opens one way and then jumps.
 */
export function useDashboardFolds() {
  const [layout, setLayout] = useState<DashboardLayout | null>(null);

  useEffect(() => {
    let isMounted = true;
    void readDashboardFolds().then((stored) => {
      if (isMounted) setLayout(stored);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  function update(change: (current: DashboardLayout) => DashboardLayout): void {
    if (layout === null) return;
    const next = change(layout);
    setLayout(next);
    void writeDashboardFolds(next);
  }

  function toggleLane(lane: KanbanLane): void {
    update((current) => {
      const collapsedLanes = new Set(current.collapsedLanes);
      if (collapsedLanes.has(lane)) collapsedLanes.delete(lane);
      else collapsedLanes.add(lane);
      return { ...current, collapsedLanes };
    });
  }

  function setClosedOpen(isClosedOpen: boolean): void {
    update((current) => ({ ...current, isClosedOpen }));
  }

  return { layout, toggleLane, setClosedOpen };
}
