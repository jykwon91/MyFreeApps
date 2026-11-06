import type { WorldZone } from "@/games/wow-forever/types/worldMap";

/** Your zone's name; null when your zone isn't set or isn't a known zone. */
export function zoneNameOf(zoneById: ReadonlyMap<number, WorldZone>, zoneId: number | null): string | null {
  if (zoneId === null) return null;
  return zoneById.get(zoneId)?.name ?? null;
}
