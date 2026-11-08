import { BEAST_SORT } from "@/games/wow-forever/data/hunterPets/hunterPetsConfig";
import type { BeastFilters } from "@/games/wow-forever/types/hunterPets/beastFilters";
import type { HunterFamily } from "@/games/wow-forever/types/hunterPets/hunterFamily";
import type { TamableBeast } from "@/games/wow-forever/types/hunterPets/tamableBeast";

function words(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}

function searchText(beast: TamableBeast, familyName: string): string {
  return [beast.name, familyName, ...beast.zones, ...beast.teaches.map((t) => t.abilityName)].join(" ").toLowerCase();
}

/** Nulls and empty values go last. */
function compareOptional(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function compareZones(a: TamableBeast, b: TamableBeast): number {
  const [zoneA, zoneB] = [a.zones[0], b.zones[0]];
  if (zoneA === undefined || zoneB === undefined) return Number(zoneA === undefined) - Number(zoneB === undefined);
  return zoneA.localeCompare(zoneB);
}

function compareBy(sort: BeastFilters["sort"], a: TamableBeast, b: TamableBeast): number {
  if (sort === BEAST_SORT.level) return compareOptional(a.minLevel, b.minLevel);
  if (sort === BEAST_SORT.speed) return compareOptional(a.attackSeconds, b.attackSeconds);
  return compareZones(a, b);
}

function compareBeasts(sort: BeastFilters["sort"]) {
  return (a: TamableBeast, b: TamableBeast): number =>
    compareBy(sort, a, b) || a.name.localeCompare(b.name) || a.id - b.id;
}

/** The beasts matching the family and search words (any order), in the chosen order. */
export function filterBeasts(
  beasts: readonly TamableBeast[],
  families: readonly HunterFamily[],
  filters: BeastFilters,
): TamableBeast[] {
  const familyName = new Map(families.map((f) => [f.id, f.name]));
  const family = filters.family ? families.find((f) => f.slug === filters.family) : undefined;
  const terms = words(filters.query);
  return beasts
    .filter((b) => {
      if (filters.family && b.familyId !== family?.id) return false;
      if (terms.length === 0) return true;
      const text = searchText(b, familyName.get(b.familyId) ?? "");
      return terms.every((t) => text.includes(t));
    })
    .sort(compareBeasts(filters.sort));
}
