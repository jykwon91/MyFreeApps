/**
 * What the rares finder should list, counted from the committed rares data so a
 * data refresh doesn't break the spec. Read from the raw JSON, not through
 * `decodeRares` / `filterRares`, so a bug there still fails it.
 */
import rareSpawnsJson from "../../../src/games/wow-forever/data/rares/classic/rareSpawns.json" with { type: "json" };
import raresJson from "../../../src/games/wow-forever/data/rares/rares.json" with { type: "json" };

/** "Fits my level" shows rares up to this many levels below the player and above (a product rule). */
export const FIT_LEVELS_BELOW = 3;
export const FIT_LEVELS_ABOVE = 2;

interface RawRare {
  confirmed: boolean;
  zones: Set<number>;
  minLevel: number | null;
  maxLevel: number | null;
}

/** Which rares to count; every field left out = that filter off. */
interface RareQuery {
  zoneId?: number;
  minLevel?: number;
  maxLevel?: number;
  fitsLevel?: number;
  confirmedOnly?: boolean;
}

function column(columns: readonly string[], name: string, file: string): number {
  const at = columns.indexOf(name);
  if (at < 0) throw new Error(`${file} has no "${name}" column`);
  return at;
}

const confirmedId = column(raresJson.columns, "id", "rares.json");
const spawnZone = column(rareSpawnsJson.spawnColumns, "zone", "rareSpawns.json");
const confirmedIds = new Set(raresJson.rares.map((row) => Number(row[confirmedId])));
const classicRares: Record<string, { minLevel: number; maxLevel: number; spawns: readonly (readonly (string | number)[])[] }> =
  rareSpawnsJson.rares;

const RARES: RawRare[] = [...new Set([...Object.keys(classicRares).map(Number), ...confirmedIds])].map((id) => {
  const classic = classicRares[String(id)];
  return {
    confirmed: confirmedIds.has(id),
    zones: new Set(classic ? classic.spawns.map((spawn) => Number(spawn[spawnZone])) : []),
    minLevel: classic ? classic.minLevel : null,
    maxLevel: classic ? classic.maxLevel : null,
  };
});

function matches(rare: RawRare, query: RareQuery): boolean {
  const { zoneId, minLevel, maxLevel, fitsLevel, confirmedOnly } = query;
  if (confirmedOnly && !rare.confirmed) return false;
  if (zoneId !== undefined && !rare.zones.has(zoneId)) return false;
  if (minLevel !== undefined && (rare.maxLevel === null || rare.maxLevel < minLevel)) return false;
  if (maxLevel !== undefined && (rare.minLevel === null || rare.minLevel > maxLevel)) return false;
  if (fitsLevel !== undefined) {
    if (rare.minLevel === null || rare.maxLevel === null) return false;
    if (rare.maxLevel < fitsLevel - FIT_LEVELS_BELOW || rare.minLevel > fitsLevel + FIT_LEVELS_ABOVE) return false;
  }
  return true;
}

/** How many rares the list shows with these filters on. */
export function rareCount(query: RareQuery = {}): number {
  return RARES.filter((rare) => matches(rare, query)).length;
}

/** Every Classic rare / rare elite with a map spot, plus the rares the Forever client has met. */
export const ALL_RARES = rareCount();

/** The rares the Forever client has met ("Confirmed in Forever"). */
export const CONFIRMED_RARES = rareCount({ confirmedOnly: true });
