import {
  LIBRARY_HIDE_FOUND_PARAM,
  LIBRARY_ITEM_LEVEL_PARAM,
  LIBRARY_PARAM_ON,
  LIBRARY_QUERY_PARAM,
} from "@/games/wow-forever/data/library/libraryConfig";
import type { LibraryFilters } from "@/games/wow-forever/types/library/libraryFilters";

export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = { query: "", itemLevel: null, hideFound: false };

function itemLevel(value: string | null): number | null {
  if (value === null || !/^\d{1,3}$/.test(value)) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}

/** The filters a URL asks for; anything malformed reads as "no filter". */
export function parseLibraryFilters(params: URLSearchParams): LibraryFilters {
  return {
    query: params.get(LIBRARY_QUERY_PARAM) ?? "",
    itemLevel: itemLevel(params.get(LIBRARY_ITEM_LEVEL_PARAM)),
    hideFound: params.get(LIBRARY_HIDE_FOUND_PARAM) === LIBRARY_PARAM_ON,
  };
}

function setOrDelete(params: URLSearchParams, key: string, value: string | null): void {
  if (value) params.set(key, value);
  else params.delete(key);
}

/** `params` with the filters written in; unset filters are left out so the plain page has a plain URL. */
export function writeLibraryFilters(params: URLSearchParams, filters: LibraryFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  setOrDelete(next, LIBRARY_QUERY_PARAM, filters.query || null);
  setOrDelete(next, LIBRARY_ITEM_LEVEL_PARAM, filters.itemLevel === null ? null : String(filters.itemLevel));
  setOrDelete(next, LIBRARY_HIDE_FOUND_PARAM, filters.hideFound ? LIBRARY_PARAM_ON : null);
  return next;
}

export function isDefaultLibraryFilters(filters: LibraryFilters): boolean {
  return filters.query.trim() === "" && filters.itemLevel === null && !filters.hideFound;
}
