/**
 * What the races page should list, counted from the committed races data so a
 * data refresh doesn't break the spec. Read from the raw JSON, not through
 * `filterRaces`, so a bug there still fails it.
 */
import racesJson from "../../../src/games/wow-forever/data/races/races.json" with { type: "json" };
import { RACIAL_STATUS } from "../../../src/games/wow-forever/data/races/racesConfig";

/** Which races to count; every field left out = that filter off. */
interface RaceQuery {
  faction?: string;
  classId?: string;
  status?: string;
  changedOnly?: boolean;
}

interface RaceListing {
  races: number;
  racials: number;
}

/** Races and racials the list shows: a racial filter drops a race left with no racial. */
export function raceListing(query: RaceQuery = {}): RaceListing {
  const racialFilterOn = query.status !== undefined || query.changedOnly === true;
  const shown = racesJson.races.flatMap((race) => {
    if (query.faction !== undefined && race.faction !== query.faction) return [];
    if (query.classId !== undefined && !race.classes.includes(query.classId)) return [];
    const racials = race.racials.filter(
      (racial) =>
        (query.status === undefined || racial.status === query.status) &&
        (!query.changedOnly || racial.status !== RACIAL_STATUS.unchanged),
    );
    return racialFilterOn && racials.length === 0 ? [] : [racials.length];
  });
  return { races: shown.length, racials: shown.reduce((sum, n) => sum + n, 0) };
}

/** Racials with this status across every race. */
export function racialsWithStatus(status: string): number {
  return raceListing({ status }).racials;
}

export const ALL_RACES = racesJson.races.length;
export const ALL_RACIALS = raceListing().racials;
