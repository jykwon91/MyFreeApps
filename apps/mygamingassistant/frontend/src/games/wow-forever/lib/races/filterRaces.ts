import { RACE_FACTION_ORDER, RACIAL_STATUS, RACIAL_STATUS_ORDER } from "@/games/wow-forever/data/races/racesConfig";
import type { Race } from "@/games/wow-forever/types/races/race";
import type { RaceFilterCounts } from "@/games/wow-forever/types/races/raceFilterCounts";
import type { RaceFilters } from "@/games/wow-forever/types/races/raceFilters";
import type { Racial } from "@/games/wow-forever/types/races/racial";

function raceMatches(race: Race, filters: RaceFilters): boolean {
  if (filters.faction !== null && race.faction !== filters.faction) return false;
  return filters.classId === null || race.classes.includes(filters.classId);
}

function racialMatches(racial: Racial, filters: RaceFilters): boolean {
  if (filters.status !== null && racial.status !== filters.status) return false;
  return !filters.changedOnly || racial.status !== RACIAL_STATUS.unchanged;
}

/**
 * The races the filters keep, each with only its matching racials. A race
 * with no matching racial drops out once a racial filter is on; with only
 * faction / class set every race that fits is shown whole.
 */
export function filterRaces(races: readonly Race[], filters: RaceFilters): Race[] {
  const racialFilterOn = filters.status !== null || filters.changedOnly;
  return races.flatMap((race) => {
    if (!raceMatches(race, filters)) return [];
    const racials = race.racials.filter((r) => racialMatches(r, filters));
    if (racialFilterOn && racials.length === 0) return [];
    return [{ ...race, racials }];
  });
}

/** Each chip's count: what the list would hold with that chip picked and every other filter as it is. */
export function raceFilterCounts(races: readonly Race[], filters: RaceFilters): RaceFilterCounts {
  const racialsOf = (f: RaceFilters) => races.filter((race) => raceMatches(race, f)).flatMap((race) => race.racials);
  const faction = Object.fromEntries(
    RACE_FACTION_ORDER.map((id) => [id, filterRaces(races, { ...filters, faction: id }).length]),
  ) as RaceFilterCounts["faction"];
  const pool = racialsOf(filters);
  const status = Object.fromEntries(
    RACIAL_STATUS_ORDER.map((id) => [
      id,
      pool.filter((r) => r.status === id && racialMatches(r, { ...filters, status: null })).length,
    ]),
  ) as RaceFilterCounts["status"];
  const changed = pool.filter((r) => racialMatches(r, { ...filters, changedOnly: true })).length;
  return { faction, status, changed };
}

/** Every racial the list shows. */
export function shownRacialCount(races: readonly Race[]): number {
  return races.reduce((sum, race) => sum + race.racials.length, 0);
}
