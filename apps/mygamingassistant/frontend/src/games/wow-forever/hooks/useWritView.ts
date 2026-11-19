import { useCallback, useMemo } from "react";
import { useLiveSearchParams } from "@platform/ui";
import {
  WRIT_DEALS_PARAM,
  WRIT_LOCATION_PARAM,
  WRIT_TIER_PARAM,
} from "@/games/wow-forever/data/professions/writs/writParams";
import { writViewFromParams, writViewToParams } from "@/games/wow-forever/lib/writs/writViewParams";
import type { WritFilters } from "@/games/wow-forever/types/writs/writFilters";
import type { WritSort } from "@/games/wow-forever/types/writs/writSort";
import type { WritSortKey } from "@/games/wow-forever/types/writs/writSortKey";
import type { WritView } from "@/games/wow-forever/types/writs/writView";

export interface WritViewState {
  view: WritView;
  setFilters: (patch: Partial<WritFilters>) => void;
  setSort: (sort: WritSort) => void;
  /** A header click: the same column flips its direction, another starts low to high. */
  toggleSort: (key: WritSortKey) => void;
  clearFilters: () => void;
}

/**
 * The writs page's filters and order, kept in the link (`?tier=`, `?loc=`, `?deals=`, `?sort=`, `?dir=`) so a view
 * can be shared and Back returns to it. Changes replace the history entry, so Back leaves the page.
 */
export function useWritView(knownLocations: readonly string[]): WritViewState {
  const [params, setParams] = useLiveSearchParams();
  const view = useMemo(() => writViewFromParams(params, knownLocations), [params, knownLocations]);

  const update = useCallback(
    (change: (current: WritView) => WritView) => {
      setParams((prev) => writViewToParams(prev, change(writViewFromParams(prev, knownLocations))), { replace: true });
    },
    [setParams, knownLocations],
  );

  const setFilters = useCallback((patch: Partial<WritFilters>) => update((v) => ({ ...v, filters: { ...v.filters, ...patch } })), [update]);
  const setSort = useCallback((sort: WritSort) => update((v) => ({ ...v, sort })), [update]);
  const toggleSort = useCallback(
    (key: WritSortKey) =>
      update((v) => ({
        ...v,
        sort: { key, direction: v.sort.key === key && v.sort.direction === "asc" ? "desc" : "asc" },
      })),
    [update],
  );
  const clearFilters = useCallback(() => {
    setParams(
      (prev) => {
        for (const name of [WRIT_TIER_PARAM, WRIT_LOCATION_PARAM, WRIT_DEALS_PARAM]) prev.delete(name);
        return prev;
      },
      { replace: true },
    );
  }, [setParams]);

  return { view, setFilters, setSort, toggleSort, clearFilters };
}
