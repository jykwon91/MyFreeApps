import {
  DEFAULT_ITEM_SORT,
  DEFAULT_ITEM_VIEW,
  DEFAULT_SORT_DIRECTION,
  ITEM_BROWSER_MAX_PAGES,
  ITEM_BROWSER_PARAM,
  ITEM_CHANGE_MARKS,
  ITEM_CLASS_GROUPS,
  ITEM_LEVEL_MAX,
  ITEM_LEVEL_MIN,
  ITEM_QUERY_MAX_LENGTH,
  LIST_SEPARATOR,
  REQUIRED_LEVEL_MIN,
} from "@/games/wow-forever/data/itemBrowser/itemBrowserConfig";
import { ITEM_QUALITIES, ITEM_SLOTS } from "@/games/wow-forever/data/itemSlots";
import { MAX_LEVEL } from "@/games/wow-forever/data/levelCap";
import type { ItemBrowserFilters } from "@/games/wow-forever/types/itemBrowser/itemBrowserFilters";
import type { ItemBrowserQuery } from "@/games/wow-forever/types/itemBrowser/itemBrowserQuery";
import { ITEM_BROWSER_VIEW, type ItemBrowserView } from "@/games/wow-forever/types/itemBrowser/itemBrowserView";
import { SORT_DIRECTION, type SortDirection } from "@/games/wow-forever/types/itemBrowser/itemSortDirection";
import { ITEM_SORT, type ItemSortKey } from "@/games/wow-forever/types/itemBrowser/itemSortKey";

export const DEFAULT_ITEM_FILTERS: ItemBrowserFilters = {
  query: "",
  qualities: [],
  groups: [],
  slots: [],
  types: [],
  changes: [],
  requiredMin: null,
  requiredMax: null,
  itemLevelMin: null,
  itemLevelMax: null,
};

const SORT_KEYS: readonly string[] = Object.values(ITEM_SORT);
const DIRECTIONS: readonly string[] = Object.values(SORT_DIRECTION);
const VIEWS: readonly string[] = Object.values(ITEM_BROWSER_VIEW);

/** The listed values the param names, in `allowed`'s order; unknown or repeated values are dropped. */
function pickList<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const asked = new Set(raw.split(LIST_SEPARATOR));
  return allowed.filter((a) => asked.has(a));
}

/** A whole number in [min, max], or null when the text isn't one. */
export function toBoundedInt(value: number | null, min: number, max: number): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  return n >= min && n <= max ? n : null;
}

/** A typed level pulled into [min, max] and rounded, so the box and the filter always agree; empty stays null. */
export function clampInt(value: number | null, min: number, max: number): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function intParam(raw: string | null, min: number, max: number): number | null {
  if (raw === null || !/^\d{1,4}$/.test(raw)) return null;
  return toBoundedInt(Number(raw), min, max);
}

function isSortKey(value: string | null): value is ItemSortKey {
  return value !== null && SORT_KEYS.includes(value);
}

function isDirection(value: string | null): value is SortDirection {
  return value !== null && DIRECTIONS.includes(value);
}

function isView(value: string | null): value is ItemBrowserView {
  return value !== null && VIEWS.includes(value);
}

/**
 * The browser's state from the URL. `knownTypes` are the armor / weapon types in
 * the index — any other `type` value is dropped. Anything malformed reads as "no filter".
 */
export function parseItemBrowserQuery(params: URLSearchParams, knownTypes: readonly string[]): ItemBrowserQuery {
  const sortParam = params.get(ITEM_BROWSER_PARAM.sort);
  const sort = isSortKey(sortParam) ? sortParam : DEFAULT_ITEM_SORT;
  const dirParam = params.get(ITEM_BROWSER_PARAM.direction);
  const viewParam = params.get(ITEM_BROWSER_PARAM.view);
  return {
    filters: {
      query: (params.get(ITEM_BROWSER_PARAM.query) ?? "").slice(0, ITEM_QUERY_MAX_LENGTH),
      qualities: pickList(params.get(ITEM_BROWSER_PARAM.quality), ITEM_QUALITIES),
      groups: pickList(params.get(ITEM_BROWSER_PARAM.group), ITEM_CLASS_GROUPS),
      slots: pickList(params.get(ITEM_BROWSER_PARAM.slot), ITEM_SLOTS),
      types: pickList(params.get(ITEM_BROWSER_PARAM.type), knownTypes),
      changes: pickList(params.get(ITEM_BROWSER_PARAM.change), ITEM_CHANGE_MARKS),
      requiredMin: intParam(params.get(ITEM_BROWSER_PARAM.requiredMin), REQUIRED_LEVEL_MIN, MAX_LEVEL),
      requiredMax: intParam(params.get(ITEM_BROWSER_PARAM.requiredMax), REQUIRED_LEVEL_MIN, MAX_LEVEL),
      itemLevelMin: intParam(params.get(ITEM_BROWSER_PARAM.itemLevelMin), ITEM_LEVEL_MIN, ITEM_LEVEL_MAX),
      itemLevelMax: intParam(params.get(ITEM_BROWSER_PARAM.itemLevelMax), ITEM_LEVEL_MIN, ITEM_LEVEL_MAX),
    },
    sort,
    direction: isDirection(dirParam) ? dirParam : DEFAULT_SORT_DIRECTION[sort],
    view: isView(viewParam) ? viewParam : DEFAULT_ITEM_VIEW,
    pages: intParam(params.get(ITEM_BROWSER_PARAM.pages), 1, ITEM_BROWSER_MAX_PAGES) ?? 1,
  };
}

function setOrDelete(params: URLSearchParams, key: string, value: string | null): void {
  if (value) params.set(key, value);
  else params.delete(key);
}

function listValue(values: readonly string[]): string | null {
  return values.length > 0 ? values.join(LIST_SEPARATOR) : null;
}

function intValue(value: number | null): string | null {
  return value === null ? null : String(value);
}

/** `params` with the state written in; defaults are left out so the plain page has a plain URL. */
export function writeItemBrowserQuery(params: URLSearchParams, query: ItemBrowserQuery): URLSearchParams {
  const next = new URLSearchParams(params);
  const { filters } = query;
  setOrDelete(next, ITEM_BROWSER_PARAM.query, filters.query.slice(0, ITEM_QUERY_MAX_LENGTH));
  setOrDelete(next, ITEM_BROWSER_PARAM.quality, listValue(filters.qualities));
  setOrDelete(next, ITEM_BROWSER_PARAM.group, listValue(filters.groups));
  setOrDelete(next, ITEM_BROWSER_PARAM.slot, listValue(filters.slots));
  setOrDelete(next, ITEM_BROWSER_PARAM.type, listValue(filters.types));
  setOrDelete(next, ITEM_BROWSER_PARAM.change, listValue(filters.changes));
  setOrDelete(next, ITEM_BROWSER_PARAM.requiredMin, intValue(filters.requiredMin));
  setOrDelete(next, ITEM_BROWSER_PARAM.requiredMax, intValue(filters.requiredMax));
  setOrDelete(next, ITEM_BROWSER_PARAM.itemLevelMin, intValue(filters.itemLevelMin));
  setOrDelete(next, ITEM_BROWSER_PARAM.itemLevelMax, intValue(filters.itemLevelMax));
  setOrDelete(next, ITEM_BROWSER_PARAM.sort, query.sort === DEFAULT_ITEM_SORT ? null : query.sort);
  setOrDelete(next, ITEM_BROWSER_PARAM.direction, query.direction === DEFAULT_SORT_DIRECTION[query.sort] ? null : query.direction);
  setOrDelete(next, ITEM_BROWSER_PARAM.view, query.view === DEFAULT_ITEM_VIEW ? null : query.view);
  setOrDelete(next, ITEM_BROWSER_PARAM.pages, query.pages > 1 ? String(query.pages) : null);
  return next;
}

/** How many filters are on (each picked chip and each level bound counts one) — the phone "Filters (n)" button. */
export function activeFilterCount(filters: ItemBrowserFilters): number {
  const bounds = [filters.requiredMin, filters.requiredMax, filters.itemLevelMin, filters.itemLevelMax];
  return (
    filters.qualities.length +
    filters.groups.length +
    filters.slots.length +
    filters.types.length +
    filters.changes.length +
    bounds.filter((b) => b !== null).length
  );
}
