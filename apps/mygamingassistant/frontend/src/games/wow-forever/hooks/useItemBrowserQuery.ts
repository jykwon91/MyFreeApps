import { useCallback, useMemo } from "react";
import {
  DEFAULT_ITEM_FILTERS,
  parseItemBrowserQuery,
  writeItemBrowserQuery,
} from "@/games/wow-forever/lib/itemBrowser/itemBrowserParams";
import type { ItemBrowserFilters } from "@/games/wow-forever/types/itemBrowser/itemBrowserFilters";
import type { ItemBrowserQuery } from "@/games/wow-forever/types/itemBrowser/itemBrowserQuery";
import { useLiveSearchParams } from "@platform/ui";

/**
 * The item browser's search, filters, sort, view and "Show more" pages, read from
 * and written to the URL (each change replaces history), so Back from an item page
 * lands on the same spot. A new search, filter or sort starts again from page one.
 */
export function useItemBrowserQuery(knownTypes: readonly string[]): {
  query: ItemBrowserQuery;
  update: (patch: Partial<Omit<ItemBrowserQuery, "filters" | "pages">>) => void;
  updateFilters: (patch: Partial<ItemBrowserFilters>) => void;
  resetFilters: () => void;
  showMore: () => void;
} {
  const [params, setParams] = useLiveSearchParams();
  const query = useMemo(() => parseItemBrowserQuery(params, knownTypes), [params, knownTypes]);
  const write = useCallback(
    (next: (current: ItemBrowserQuery) => ItemBrowserQuery) =>
      setParams((prev) => writeItemBrowserQuery(prev, next(parseItemBrowserQuery(prev, knownTypes))), { replace: true }),
    [setParams, knownTypes],
  );
  const update = useCallback(
    (patch: Partial<Omit<ItemBrowserQuery, "filters" | "pages">>) =>
      write((current) => ({ ...current, ...patch, pages: patch.sort === undefined && patch.direction === undefined ? current.pages : 1 })),
    [write],
  );
  const updateFilters = useCallback(
    (patch: Partial<ItemBrowserFilters>) => write((current) => ({ ...current, filters: { ...current.filters, ...patch }, pages: 1 })),
    [write],
  );
  const resetFilters = useCallback(
    () =>
      write((current) => ({ ...current, filters: { ...DEFAULT_ITEM_FILTERS, query: current.filters.query }, pages: 1 })),
    [write],
  );
  const showMore = useCallback(() => write((current) => ({ ...current, pages: current.pages + 1 })), [write]);
  return { query, update, updateFilters, resetFilters, showMore };
}
