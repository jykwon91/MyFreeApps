import { MAX_LEVEL } from "@/games/wow-forever/data/levelCap";
import {
  SPELLBOOK_DIFFERENT_ON,
  SPELLBOOK_DIFFERENT_PARAM,
  SPELLBOOK_LEVEL_PARAM,
  SPELLBOOK_QUERY_PARAM,
  SPELLBOOK_TAB_PARAM,
} from "@/games/wow-forever/data/spellbook/spellbookConfig";
import type { SpellbookFilters } from "@/games/wow-forever/types/spellbook/spellbookFilters";

export const DEFAULT_SPELLBOOK_FILTERS: SpellbookFilters = { tab: null, differentOnly: false, query: "", level: null };

function positiveInt(value: string | null): number | null {
  if (value === null || !/^\d{1,7}$/.test(value)) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}

/** A typed level as a whole level from 1 to the max level, or null when it isn't one. */
export function toSpellbookLevel(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  return n >= 1 && n <= MAX_LEVEL ? n : null;
}

/** The filters a URL asks for; anything malformed reads as "no filter". */
export function parseSpellbookFilters(params: URLSearchParams): SpellbookFilters {
  return {
    tab: positiveInt(params.get(SPELLBOOK_TAB_PARAM)),
    differentOnly: params.get(SPELLBOOK_DIFFERENT_PARAM) === SPELLBOOK_DIFFERENT_ON,
    query: params.get(SPELLBOOK_QUERY_PARAM) ?? "",
    level: toSpellbookLevel(positiveInt(params.get(SPELLBOOK_LEVEL_PARAM))),
  };
}

function setOrDelete(params: URLSearchParams, key: string, value: string | null): void {
  if (value) params.set(key, value);
  else params.delete(key);
}

/** `params` with the filters written in; unset filters are left out so the plain page has a plain URL. */
export function writeSpellbookFilters(params: URLSearchParams, filters: SpellbookFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  setOrDelete(next, SPELLBOOK_TAB_PARAM, filters.tab === null ? null : String(filters.tab));
  setOrDelete(next, SPELLBOOK_DIFFERENT_PARAM, filters.differentOnly ? SPELLBOOK_DIFFERENT_ON : null);
  setOrDelete(next, SPELLBOOK_QUERY_PARAM, filters.query);
  setOrDelete(next, SPELLBOOK_LEVEL_PARAM, filters.level === null ? null : String(filters.level));
  return next;
}

export function isDefaultSpellbookFilters(filters: SpellbookFilters): boolean {
  return filters.tab === null && !filters.differentOnly && filters.query.trim() === "" && filters.level === null;
}
