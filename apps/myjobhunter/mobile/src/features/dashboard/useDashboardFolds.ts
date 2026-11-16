import type { KanbanLane } from "@myjobhunter/api-client/types/kanban/kanban-lane";
import { useCallback, useEffect, useRef, useState } from "react";
import { readDashboardFolds, writeDashboardFolds } from "../../lib/dashboardFoldPrefs";
import type { DashboardLayout } from "../../types/DashboardLayout";

/**
 * Which lanes and stages are folded, kept between launches as the website keeps them.
 * `layout` is null until the phone has read them, so the board never opens one way and then jumps.
 */
export function useDashboardFolds() {
  const [layout, setLayout] = useState<DashboardLayout | null>(null);
  // Read when a fold is toggled, so the toggles keep one identity and the memoized rows holding them aren't redrawn.
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    let isMounted = true;
    void readDashboardFolds().then((stored) => {
      if (isMounted) setLayout(stored);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const update = useCallback((change: (current: DashboardLayout) => DashboardLayout): void => {
    const current = layoutRef.current;
    if (current === null) return;
    const next = change(current);
    setLayout(next);
    void writeDashboardFolds(next);
  }, []);

  const toggleLane = useCallback(
    (lane: KanbanLane): void => {
      update((current) => {
        const collapsedLanes = new Set(current.collapsedLanes);
        if (collapsedLanes.has(lane)) collapsedLanes.delete(lane);
        else collapsedLanes.add(lane);
        return { ...current, collapsedLanes };
      });
    },
    [update],
  );

  const setClosedOpen = useCallback((isClosedOpen: boolean): void => update((current) => ({ ...current, isClosedOpen })), [update]);

  return { layout, toggleLane, setClosedOpen };
}
