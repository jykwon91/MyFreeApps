import { useCallback, useEffect, useState } from "react";

/**
 * Per-lane collapse state, persisted to localStorage.
 *
 * Per UX review: lanes are independently collapsible. Operator may
 * want to focus only on Strong fits some days. Collapse state must
 * survive refresh.
 *
 * Storage key shape: ``mjh_kanban_lane_<lane>`` — boolean (true =
 * collapsed). The hook returns the current state + a toggle callback.
 *
 * Listens to ``storage`` events so the kanban stays in sync across
 * tabs (collapse a lane in tab A → tab B's kanban hides it on next
 * render).
 */
export type KanbanLane = "strong_fit" | "everything_else";

const PREFIX = "mjh_kanban_lane_";

function storageKey(lane: KanbanLane): string {
  return `${PREFIX}${lane}`;
}

function readCollapsed(lane: KanbanLane): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey(lane)) === "true";
  } catch {
    return false;
  }
}

export function useLaneCollapse(lane: KanbanLane): {
  collapsed: boolean;
  toggle: () => void;
} {
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed(lane));

  // Sync across tabs.
  useEffect(() => {
    function handler(event: StorageEvent) {
      if (event.key === storageKey(lane)) {
        setCollapsed(event.newValue === "true");
      }
    }
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [lane]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey(lane), String(next));
      } catch {
        // localStorage failures are non-blocking — operator just loses
        // the persistence, the in-memory state still flips.
      }
      return next;
    });
  }, [lane]);

  return { collapsed, toggle };
}
