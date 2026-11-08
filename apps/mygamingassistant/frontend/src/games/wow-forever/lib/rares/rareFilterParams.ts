import {
  RARE_FIT_ON,
  RARE_FIT_PARAM,
  RARE_LEVEL_MAX,
  RARE_LEVEL_MIN,
  RARE_MAX_LEVEL_PARAM,
  RARE_MIN_LEVEL_PARAM,
  RARE_ZONE_PARAM,
} from "@/games/wow-forever/data/rares/raresConfig";
import type { RareFilters } from "@/games/wow-forever/types/rares/rareFilters";

export const DEFAULT_RARE_FILTERS: RareFilters = { zoneId: null, minLevel: null, maxLevel: null, fitsMyLevel: false };

function positiveInt(value: string | null): number | null {
  if (value === null || !/^\d{1,6}$/.test(value)) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}

function level(value: string | null): number | null {
  const n = positiveInt(value);
  return n !== null && n >= RARE_LEVEL_MIN && n <= RARE_LEVEL_MAX ? n : null;
}

/** A typed level as a whole level in the game's range, or null when it isn't one. */
export function toLevel(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  return n >= RARE_LEVEL_MIN && n <= RARE_LEVEL_MAX ? n : null;
}

/** The filters a URL asks for; anything malformed reads as "no filter". */
export function parseRareFilters(params: URLSearchParams): RareFilters {
  return {
    zoneId: positiveInt(params.get(RARE_ZONE_PARAM)),
    minLevel: level(params.get(RARE_MIN_LEVEL_PARAM)),
    maxLevel: level(params.get(RARE_MAX_LEVEL_PARAM)),
    fitsMyLevel: params.get(RARE_FIT_PARAM) === RARE_FIT_ON,
  };
}

function setOrDelete(params: URLSearchParams, key: string, value: string | null): void {
  if (value) params.set(key, value);
  else params.delete(key);
}

/** `params` with the filters written in; unset filters are left out so the plain page has a plain URL. */
export function writeRareFilters(params: URLSearchParams, filters: RareFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  setOrDelete(next, RARE_ZONE_PARAM, filters.zoneId === null ? null : String(filters.zoneId));
  setOrDelete(next, RARE_MIN_LEVEL_PARAM, filters.minLevel === null ? null : String(filters.minLevel));
  setOrDelete(next, RARE_MAX_LEVEL_PARAM, filters.maxLevel === null ? null : String(filters.maxLevel));
  setOrDelete(next, RARE_FIT_PARAM, filters.fitsMyLevel ? RARE_FIT_ON : null);
  return next;
}

export function isDefaultRareFilters(filters: RareFilters): boolean {
  return filters.zoneId === null && filters.minLevel === null && filters.maxLevel === null && !filters.fitsMyLevel;
}
