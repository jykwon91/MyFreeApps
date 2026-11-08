import { WOW_CLASSES, type WowClassId } from "@/games/wow-forever/data/classes";
import {
  RACE_CHANGED_PARAM,
  RACE_CLASS_PARAM,
  RACE_FACTION,
  RACE_FACTION_PARAM,
  RACE_PARAM_ON,
  RACE_STATUS_PARAM,
  RACIAL_STATUS,
} from "@/games/wow-forever/data/races/racesConfig";
import type { RaceFaction } from "@/games/wow-forever/types/races/raceFaction";
import type { RaceFilters } from "@/games/wow-forever/types/races/raceFilters";
import type { RacialStatus } from "@/games/wow-forever/types/races/racialStatus";

export const DEFAULT_RACE_FILTERS: RaceFilters = { faction: null, classId: null, status: null, changedOnly: false };

function pick<T extends string>(value: string | null, allowed: readonly string[]): T | null {
  return value !== null && allowed.includes(value) ? (value as T) : null;
}

/** The filters a URL asks for; anything malformed reads as "no filter". */
export function parseRaceFilters(params: URLSearchParams): RaceFilters {
  return {
    faction: pick<RaceFaction>(params.get(RACE_FACTION_PARAM), Object.values(RACE_FACTION)),
    classId: pick<WowClassId>(params.get(RACE_CLASS_PARAM), WOW_CLASSES.map((c) => c.id)),
    status: pick<RacialStatus>(params.get(RACE_STATUS_PARAM), Object.values(RACIAL_STATUS)),
    changedOnly: params.get(RACE_CHANGED_PARAM) === RACE_PARAM_ON,
  };
}

function setOrDelete(params: URLSearchParams, key: string, value: string | null): void {
  if (value) params.set(key, value);
  else params.delete(key);
}

/** `params` with the filters written in; unset filters are left out so the plain page has a plain URL. */
export function writeRaceFilters(params: URLSearchParams, filters: RaceFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  setOrDelete(next, RACE_FACTION_PARAM, filters.faction);
  setOrDelete(next, RACE_CLASS_PARAM, filters.classId);
  setOrDelete(next, RACE_STATUS_PARAM, filters.status);
  setOrDelete(next, RACE_CHANGED_PARAM, filters.changedOnly ? RACE_PARAM_ON : null);
  return next;
}

export function isDefaultRaceFilters(filters: RaceFilters): boolean {
  return filters.faction === null && filters.classId === null && filters.status === null && !filters.changedOnly;
}
