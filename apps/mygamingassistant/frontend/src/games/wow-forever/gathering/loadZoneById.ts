import type { WorldZone } from "@/games/wow-forever/types/worldMap";
import { decodeZone } from "@/games/wow-forever/worldMap/decodeWorldMap";

/** Forever's zones (`zones.json`: names, levels, territory), by id. */
export async function loadZoneById(): Promise<ReadonlyMap<number, WorldZone>> {
  const zones = await import("@/games/wow-forever/data/worldMap/zones.json");
  const decoded = (zones.default.zones as readonly unknown[]).map(decodeZone);
  return new Map(decoded.map((z) => [z.id, z]));
}
