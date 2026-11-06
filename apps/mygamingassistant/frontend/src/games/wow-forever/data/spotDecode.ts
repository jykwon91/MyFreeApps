import { TERRITORY, type Territory } from "@/games/wow-forever/types/worldMap";
import type { MobSpot } from "@/games/wow-forever/types/recipeSources";

/** One cell of the generated files' compact rows. */
export type SourceCell = string | number | boolean | null;

export interface SpotDecoder {
  zoneName(zoneId: number): string;
  /** A row's zone / subzone / x / y cells as a map spot; null when the row has no zone. */
  spotAt(zoneId: SourceCell | undefined, subzone: SourceCell | undefined, x: SourceCell | undefined, y: SourceCell | undefined): MobSpot | null;
}

/**
 * Places rows of the files `scripts/wow_food/recipe_sources.py` writes
 * (cmangos classic-db) on the World Map: zone ids are named from the file's
 * `zones`, and their side from its `territory`.
 */
export function createSpotDecoder(
  zones: Readonly<Record<string, string>>,
  territories: Readonly<Record<string, string>> | undefined,
): SpotDecoder {
  function zoneName(zoneId: number): string {
    return zones[String(zoneId)] ?? "";
  }

  function territory(zoneId: number): Territory | null {
    const side = territories?.[String(zoneId)];
    return Object.values(TERRITORY).find((t) => t === side) ?? null;
  }

  return {
    zoneName,
    spotAt(zoneId, subzone, x, y) {
      if (zoneId === null || zoneId === undefined) return null;
      return {
        zoneId: Number(zoneId),
        zoneName: zoneName(Number(zoneId)),
        subzone: String(subzone ?? ""),
        x: Number(x),
        y: Number(y),
        territory: territory(Number(zoneId)),
      };
    },
  };
}
