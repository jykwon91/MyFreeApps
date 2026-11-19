import { useCallback, useMemo } from "react";
import { useLiveSearchParams } from "@platform/ui";
import { PROFESSION_TIER_PARAM } from "@/games/wow-forever/data/professions/professionTiers/viewParams";
import { crateViewFromParams, crateViewToParams } from "@/games/wow-forever/lib/crates/crateViewParams";
import { nextSort } from "@/games/wow-forever/lib/professionTiers/nextSort";
import type { CrateFilters } from "@/games/wow-forever/types/crates/crateFilters";
import type { CrateSort } from "@/games/wow-forever/types/crates/crateSort";
import type { CrateSortKey } from "@/games/wow-forever/types/crates/crateSortKey";
import type { CrateView } from "@/games/wow-forever/types/crates/crateView";

export interface CrateViewState {
  view: CrateView;
  setFilters: (patch: Partial<CrateFilters>) => void;
  setSort: (sort: CrateSort) => void;
  /** A header click: the same column flips its direction, another starts low to high. */
  toggleSort: (key: CrateSortKey) => void;
  clearFilters: () => void;
}

/**
 * The crates page's filter and order, kept in the link (`?tier=`, `?sort=`, `?dir=`) so a view can be shared and
 * Back returns to it. Changes replace the history entry, so Back leaves the page.
 */
export function useCrateView(): CrateViewState {
  const [params, setParams] = useLiveSearchParams();
  const view = useMemo(() => crateViewFromParams(params), [params]);

  const update = useCallback(
    (change: (current: CrateView) => CrateView) => {
      setParams((prev) => crateViewToParams(prev, change(crateViewFromParams(prev))), { replace: true });
    },
    [setParams],
  );

  const setFilters = useCallback((patch: Partial<CrateFilters>) => update((v) => ({ ...v, filters: { ...v.filters, ...patch } })), [update]);
  const setSort = useCallback((sort: CrateSort) => update((v) => ({ ...v, sort })), [update]);
  const toggleSort = useCallback((key: CrateSortKey) => update((v) => ({ ...v, sort: nextSort(v.sort, key) })), [update]);
  const clearFilters = useCallback(() => {
    setParams(
      (prev) => {
        prev.delete(PROFESSION_TIER_PARAM);
        return prev;
      },
      { replace: true },
    );
  }, [setParams]);

  return { view, setFilters, setSort, toggleSort, clearFilters };
}
